import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Logger } from "../log.js";
import { createLogger } from "../log.js";
import { safeUrl, scrubText } from "../redact.js";
import { ApiError, type ApiErrorCode } from "./errors.js";
import { TokenBucket } from "./rate-limit.js";
import {
  ContactSchema,
  CreateContactSchema,
  CreateTaskSchema,
  ProjectSchema,
  SummarySchema,
  TaskSchema,
  entitySchema,
  pageSchema,
  type Contact,
  type CreateContactInput,
  type CreateTaskInput,
  type Project,
  type Summary,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
} from "./schemas.js";
import type { Page } from "./pagination.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const BODY_LIMIT = 2_000_000;

export interface ClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  log?: Logger;
}

interface RequestSpec {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function encodeId(id: string, label: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new ApiError({
      code: "validation",
      message: `${label} must be 1-80 characters and use letters, numbers, underscores, or hyphens.`,
      retryable: false,
    });
  }
  return encodeURIComponent(id);
}

function compact(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

function causeCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("cause" in error)) return undefined;
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object" || !("code" in cause)) return undefined;
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function retryAfterMs(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0 && /^\d+(\.\d+)?$/.test(header.trim())) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

function classifyStatus(status: number): { code: ApiErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: "unauthorized", retryable: false };
  if (status === 404) return { code: "not_found", retryable: false };
  if (status === 409) return { code: "conflict", retryable: false };
  if (status === 408) return { code: "timeout", retryable: true };
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status === 400 || status === 422) return { code: "validation", retryable: false };
  if (status >= 500) return { code: "upstream", retryable: true };
  return { code: "upstream", retryable: false };
}

function defaultMessage(code: ApiErrorCode): string {
  switch (code) {
    case "unauthorized":
      return "The API rejected the credentials.";
    case "not_found":
      return "The API resource was not found.";
    case "validation":
      return "The API rejected the request.";
    case "rate_limited":
      return "The API rate limit was hit.";
    case "conflict":
      return "The API reported a conflict.";
    case "timeout":
      return "The API request timed out.";
    case "network":
      return "The API could not be reached.";
    case "read_only":
      return "The server is in read-only mode.";
    default:
      return "The API request failed.";
  }
}

function buildUrl(base: string, path: string, query: RequestSpec["query"]): URL {
  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

/**
 * REST client used by every tool.
 * Reads retry with backoff. Writes retry only on 408, 429, or a connection that never left the machine.
 */
export class RestClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly log: Logger;
  private readonly bucket: TokenBucket;
  private readonly secrets: string[];

  constructor(
    private readonly config: AppConfig,
    deps: ClientDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.secrets = [config.apiKey, config.httpToken ?? ""].filter((value) => value.length >= 6);
    this.log =
      deps.log ??
      createLogger({
        level: config.logLevel,
        secrets: this.secrets,
      });
    this.bucket = new TokenBucket(config.rateLimitRps, config.rateLimitBurst, this.now, this.sleep);
  }

  get readOnly(): boolean {
    return this.config.readOnly;
  }

  async getSummary(): Promise<Summary> {
    const body = await this.request({ method: "GET", path: "/v1/summary" }, entitySchema(SummarySchema));
    return body.data;
  }

  async listProjects(query: { cursor?: string; limit?: number } = {}): Promise<Page<Project>> {
    return this.request(
      { method: "GET", path: "/v1/projects", query: { cursor: query.cursor, limit: query.limit } },
      pageSchema(ProjectSchema),
    );
  }

  async getProject(id: string): Promise<Project> {
    const body = await this.request(
      { method: "GET", path: `/v1/projects/${encodeId(id, "projectId")}` },
      entitySchema(ProjectSchema),
    );
    return body.data;
  }

  async listTasks(query: {
    cursor?: string;
    limit?: number;
    projectId?: string;
    status?: TaskStatus;
    assigneeId?: string;
  } = {}): Promise<Page<Task>> {
    return this.request(
      {
        method: "GET",
        path: "/v1/tasks",
        query: {
          cursor: query.cursor,
          limit: query.limit,
          projectId: query.projectId,
          status: query.status,
          assigneeId: query.assigneeId,
        },
      },
      pageSchema(TaskSchema),
    );
  }

  async getTask(id: string): Promise<Task> {
    const body = await this.request(
      { method: "GET", path: `/v1/tasks/${encodeId(id, "taskId")}` },
      entitySchema(TaskSchema),
    );
    return body.data;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const body = CreateTaskSchema.parse(input);
    const result = await this.request(
      { method: "POST", path: "/v1/tasks", body: compact(body) },
      entitySchema(TaskSchema),
    );
    return result.data;
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const body = await this.request(
      { method: "PATCH", path: `/v1/tasks/${encodeId(id, "taskId")}`, body: compact(input) },
      entitySchema(TaskSchema),
    );
    return body.data;
  }

  async listContacts(query: { cursor?: string; limit?: number; q?: string } = {}): Promise<Page<Contact>> {
    return this.request(
      { method: "GET", path: "/v1/contacts", query: { cursor: query.cursor, limit: query.limit, q: query.q } },
      pageSchema(ContactSchema),
    );
  }

  async getContact(id: string): Promise<Contact> {
    const body = await this.request(
      { method: "GET", path: `/v1/contacts/${encodeId(id, "contactId")}` },
      entitySchema(ContactSchema),
    );
    return body.data;
  }

  async createContact(input: CreateContactInput): Promise<Contact> {
    const body = CreateContactSchema.parse(input);
    const result = await this.request(
      { method: "POST", path: "/v1/contacts", body: compact(body) },
      entitySchema(ContactSchema),
    );
    return result.data;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.authStyle === "bearer" || this.config.authStyle === "both") {
      headers.authorization = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.authStyle === "api-key" || this.config.authStyle === "both") {
      headers[this.config.apiKeyHeader] = this.config.apiKey;
    }
    return headers;
  }

  private shouldRetry(error: ApiError, method: string): boolean {
    if (!error.retryable) return false;
    if (method === "GET") return true;
    if (error.code === "rate_limited" || error.status === 408) return true;
    if (error.code === "network" && !error.probablySent) return true;
    return false;
  }

  private delayMs(attempt: number, error: ApiError, method: string): number | null {
    if (!this.shouldRetry(error, method)) return null;
    if (error.retryAfterMs !== undefined) {
      return Math.min(Math.max(0, error.retryAfterMs), this.config.retryMaxMs);
    }
    const exp = this.config.retryBaseMs * 2 ** attempt;
    const capped = Math.min(exp, this.config.retryMaxMs);
    return Math.round(this.random() * capped);
  }

  private scrub(error: ApiError, method: string): ApiError {
    error.message = scrubText(error.message, this.secrets);
    error.safeToRetry = this.shouldRetry(error, method);
    return error;
  }

  private async request<T>(spec: RequestSpec, schema: z.ZodType<T>): Promise<T> {
    if (this.config.readOnly && spec.method !== "GET") {
      throw new ApiError({
        code: "read_only",
        message: `Read-only mode blocked ${spec.method} ${spec.path}.`,
        retryable: false,
        probablySent: false,
      });
    }

    const requestId = `req_${randomUUID().slice(0, 8)}`;
    const attempts = this.config.maxRetries + 1;
    let lastError: ApiError | undefined;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await this.bucket.acquire();
        return await this.attempt(spec, schema, requestId, attempt);
      } catch (error) {
        lastError =
          error instanceof ApiError
            ? error
            : new ApiError({
                code: "upstream",
                message: "The API request failed.",
                retryable: false,
                requestId,
              });
        const wait = attempt < attempts - 1 ? this.delayMs(attempt, lastError, spec.method) : null;
        if (wait === null) throw this.scrub(lastError, spec.method);
        this.log.warn("retrying upstream request", {
          method: spec.method,
          path: spec.path,
          attempt: attempt + 1,
          waitMs: wait,
          requestId,
          code: lastError.code,
        });
        await this.sleep(wait);
      }
    }

    throw this.scrub(
      lastError ??
        new ApiError({
          code: "upstream",
          message: "The API request failed.",
          retryable: false,
          requestId,
        }),
      spec.method,
    );
  }

  private async attempt<T>(spec: RequestSpec, schema: z.ZodType<T>, requestId: string, attempt: number): Promise<T> {
    const url = buildUrl(this.config.apiBaseUrl, spec.path, spec.query);
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": this.config.userAgent,
      "x-request-id": requestId,
      ...this.authHeaders(),
    };
    const init: RequestInit = {
      method: spec.method,
      headers,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    };
    if (spec.body) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(spec.body);
    }

    const started = this.now();
    this.log.debug("upstream request", {
      method: spec.method,
      url: safeUrl(url),
      requestId,
      attempt,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (error) {
      const code = causeCode(error);
      const notSent = code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EHOSTUNREACH";
      this.log.debug("upstream network error", {
        method: spec.method,
        path: spec.path,
        requestId,
        cause: code,
        name: error instanceof Error ? error.name : "Error",
      });
      if (isTimeout(error)) {
        throw new ApiError({
          code: "timeout",
          message: "The API request timed out.",
          retryable: true,
          probablySent: true,
          requestId,
        });
      }
      throw new ApiError({
        code: "network",
        message: "The API could not be reached.",
        retryable: true,
        probablySent: !notSent,
        requestId,
      });
    }

    const text = await response.text();
    const elapsed = this.now() - started;
    this.log.info("upstream response", {
      method: spec.method,
      path: spec.path,
      status: response.status,
      ms: elapsed,
      requestId,
      attempt,
    });

    if (text.length > BODY_LIMIT) {
      throw new ApiError({
        code: "upstream",
        message: "The API response was larger than 2 MB.",
        status: response.status,
        retryable: false,
        requestId,
      });
    }

    const json = text.length === 0 ? undefined : parseJson(text, response.status, requestId);

    if (!response.ok) {
      throw this.errorFromResponse(response, json, requestId);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      this.log.debug("upstream schema mismatch", {
        method: spec.method,
        path: spec.path,
        requestId,
        body: text.slice(0, 500),
      });
      throw new ApiError({
        code: "upstream",
        message: "The API response did not match the expected schema.",
        status: response.status,
        retryable: false,
        requestId,
      });
    }
    return parsed.data;
  }

  private errorFromResponse(response: Response, json: unknown, requestId: string): ApiError {
    const kind = classifyStatus(response.status);
    const body = asErrorBody(json);
    const upstreamMessage = body?.message?.trim();
    const message = upstreamMessage ? upstreamMessage.slice(0, 300) : defaultMessage(kind.code);
    return new ApiError({
      code: kind.code,
      message,
      status: response.status,
      retryable: kind.retryable,
      retryAfterMs: retryAfterMs(response.headers.get("retry-after"), this.now()),
      probablySent: true,
      requestId: body?.requestId ?? requestId,
    });
  }
}

function parseJson(text: string, status: number, requestId: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError({
      code: "upstream",
      message: "The API returned a non-JSON response.",
      status,
      retryable: status >= 500,
      requestId,
    });
  }
}

function asErrorBody(json: unknown): { message?: string; requestId?: string } | undefined {
  if (!json || typeof json !== "object" || !("error" in json)) return undefined;
  const error = (json as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = "message" in error && typeof error.message === "string" ? error.message : undefined;
  const requestId = "requestId" in error && typeof error.requestId === "string" ? error.requestId : undefined;
  return { message, requestId };
}

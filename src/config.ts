import { readFileSync } from "node:fs";
import { z } from "zod";
import { LOG_LEVELS, type LogLevel } from "./log.js";
import { USER_AGENT } from "./version.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type AuthStyle = "bearer" | "api-key" | "both";
export type ConfigSource = "default" | "env" | "cli";

export interface AppConfig {
  apiBaseUrl: string;
  apiBaseUrlSource: ConfigSource;
  apiKey: string;
  authStyle: AuthStyle;
  apiKeyHeader: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  retryMaxMs: number;
  rateLimitRps: number;
  rateLimitBurst: number;
  readOnly: boolean;
  httpHost: string;
  httpPort: number;
  httpToken?: string;
  mockHost: string;
  mockPort: number;
  logLevel: LogLevel;
  userAgent: string;
}

export interface CliOverrides {
  baseUrl?: string;
  apiKey?: string;
  authStyle?: AuthStyle;
  readOnly?: boolean;
  port?: number;
  host?: string;
  logLevel?: LogLevel;
}

const SECRET_FIELDS = new Set(["API_KEY", "MCP_HTTP_TOKEN"]);

function issue(ctx: z.RefinementCtx, message: string): never {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  return undefined as never;
}

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function intField(fallback: number, min: number, max: number) {
  return z.string().optional().transform((value, ctx) => {
    if (blank(value)) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return issue(ctx, `must be an integer from ${min} to ${max}`);
    }
    return parsed;
  });
}

function numberField(fallback: number, min: number, max: number) {
  return z.string().optional().transform((value, ctx) => {
    if (blank(value)) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return issue(ctx, `must be a number from ${min} to ${max}`);
    }
    return parsed;
  });
}

function boolField(fallback: boolean) {
  return z.string().optional().transform((value, ctx) => {
    if (blank(value)) return fallback;
    const normalized = value!.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return issue(ctx, "must be true or false");
  });
}

const EnvSchema = z.object({
  API_BASE_URL: z.string().optional(),
  API_KEY: z.string().optional(),
  API_AUTH_STYLE: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (blank(value)) return "bearer" as AuthStyle;
      const normalized = value!.trim().toLowerCase();
      if (normalized === "bearer" || normalized === "api-key" || normalized === "both") return normalized;
      return issue(ctx, "must be bearer, api-key, or both");
    }),
  API_KEY_HEADER: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const header = blank(value) ? "x-api-key" : value!.trim().toLowerCase();
      if (!/^[a-z0-9-]{1,64}$/.test(header)) return issue(ctx, "must be a simple HTTP header name");
      return header;
    }),
  API_TIMEOUT_MS: intField(10_000, 100, 120_000),
  API_MAX_RETRIES: intField(3, 0, 8),
  API_RETRY_BASE_MS: intField(200, 0, 10_000),
  API_RETRY_MAX_MS: intField(8_000, 0, 60_000),
  API_RATE_LIMIT_RPS: numberField(10, 0.1, 1_000),
  API_RATE_LIMIT_BURST: intField(20, 1, 10_000),
  MCP_READ_ONLY: boolField(true),
  MCP_HTTP_HOST: z.string().optional(),
  MCP_HTTP_PORT: intField(8787, 0, 65_535),
  MCP_HTTP_TOKEN: z.string().optional(),
  MOCK_API_HOST: z.string().optional(),
  MOCK_API_PORT: intField(8788, 0, 65_535),
  LOG_LEVEL: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (blank(value)) return "info" as LogLevel;
      const normalized = value!.trim().toLowerCase();
      if ((LOG_LEVELS as readonly string[]).includes(normalized)) return normalized as LogLevel;
      return issue(ctx, "must be debug, info, warn, error, or silent");
    }),
});

function parseBaseUrl(raw: string | undefined, ctxLabel: string): { url?: string; error?: string } {
  if (blank(raw)) return {};
  let url: URL;
  try {
    url = new URL(raw!.trim());
  } catch {
    return { error: `${ctxLabel} must be an absolute http(s) URL` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: `${ctxLabel} must use http or https` };
  }
  if (url.username || url.password) {
    return { error: `${ctxLabel} must not include a username or password. Set API_KEY instead.` };
  }
  if (url.search || url.hash) {
    return { error: `${ctxLabel} must not include a query string or hash` };
  }
  const path = url.pathname.replace(/\/$/, "");
  return { url: `${url.origin}${path}` };
}

export function formatConfigError(error: z.ZodError): string {
  return error.issues
    .map((item) => {
      const key = String(item.path[0] ?? "config");
      const message = item.message || "is invalid";
      if (SECRET_FIELDS.has(key)) return `${key} is invalid`;
      return `${key}: ${message}`;
    })
    .join("\n");
}

export function loadConfig(input: {
  env?: Record<string, string | undefined>;
  cli?: CliOverrides;
} = {}): AppConfig {
  const env = input.env ?? process.env;
  const cli = input.cli ?? {};
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(formatConfigError(parsed.error));
  }
  const values = parsed.data;

  const baseFromCli = parseBaseUrl(cli.baseUrl, "--base-url");
  const baseFromEnv = parseBaseUrl(values.API_BASE_URL, "API_BASE_URL");
  if (baseFromCli.error) throw new ConfigError(baseFromCli.error);
  if (baseFromEnv.error) throw new ConfigError(baseFromEnv.error);

  let apiBaseUrl = "http://127.0.0.1:8788";
  let apiBaseUrlSource: ConfigSource = "default";
  if (baseFromEnv.url) {
    apiBaseUrl = baseFromEnv.url;
    apiBaseUrlSource = "env";
  }
  if (baseFromCli.url) {
    apiBaseUrl = baseFromCli.url;
    apiBaseUrlSource = "cli";
  }

  const apiKeyFromEnv = blank(values.API_KEY) ? undefined : values.API_KEY!.trim();
  const apiKeyFromCli = blank(cli.apiKey) ? undefined : cli.apiKey!.trim();
  const apiKey = apiKeyFromCli ?? apiKeyFromEnv;

  if (apiBaseUrlSource !== "default" && !apiKey) {
    throw new ConfigError("API_KEY is required when API_BASE_URL points at your API.");
  }
  if (apiKey && apiKey.length > 512) {
    throw new ConfigError("API_KEY is too long.");
  }

  const httpTokenRaw = blank(values.MCP_HTTP_TOKEN) ? undefined : values.MCP_HTTP_TOKEN!.trim();
  if (httpTokenRaw && httpTokenRaw.length < 8) {
    throw new ConfigError("MCP_HTTP_TOKEN must be at least 8 characters when it is set.");
  }

  const httpHost = cli.host?.trim() || (blank(values.MCP_HTTP_HOST) ? "127.0.0.1" : values.MCP_HTTP_HOST!.trim());
  const mockHost = blank(values.MOCK_API_HOST) ? "127.0.0.1" : values.MOCK_API_HOST!.trim();

  return {
    apiBaseUrl,
    apiBaseUrlSource,
    apiKey: apiKey ?? "sandbox-demo-key",
    authStyle: cli.authStyle ?? values.API_AUTH_STYLE,
    apiKeyHeader: values.API_KEY_HEADER,
    timeoutMs: values.API_TIMEOUT_MS,
    maxRetries: values.API_MAX_RETRIES,
    retryBaseMs: values.API_RETRY_BASE_MS,
    retryMaxMs: values.API_RETRY_MAX_MS,
    rateLimitRps: values.API_RATE_LIMIT_RPS,
    rateLimitBurst: values.API_RATE_LIMIT_BURST,
    readOnly: cli.readOnly ?? values.MCP_READ_ONLY,
    httpHost,
    httpPort: cli.port ?? values.MCP_HTTP_PORT,
    ...(httpTokenRaw ? { httpToken: httpTokenRaw } : {}),
    mockHost,
    mockPort: values.MOCK_API_PORT,
    logLevel: cli.logLevel ?? values.LOG_LEVEL,
    userAgent: USER_AGENT,
  };
}

/** Minimal .env reader. Existing process environment wins; values are never logged. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function readEnvFile(path: string): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(path, "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw new ConfigError(`Could not read env file ${path}.`);
  }
}

export function mergeEnv(
  fileEnv: Record<string, string>,
  processEnv: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return { ...fileEnv, ...processEnv };
}

import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { ZodError } from "zod";
import { ApiError } from "../api/errors.js";
import { paginate } from "../api/pagination.js";
import {
  CreateContactSchema,
  CreateTaskSchema,
  TaskStatusSchema,
  UpdateTaskSchema,
  type Contact,
  type Task,
} from "../api/schemas.js";
import { apiContract } from "../contract.js";
import { SANDBOX_API_KEY } from "./constants.js";
import { createSeed, summarize, type Store } from "./data.js";

export interface MockAppOptions {
  apiKeys?: readonly string[];
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(3).toString("hex")}`;
}

function apiError(
  c: { json: (body: unknown, status?: number) => Response },
  status: 400 | 401 | 404 | 409,
  code: string,
  message: string,
  requestId: string,
): Response {
  return c.json({ error: { code, message, requestId } }, status);
}

function queryLimit(raw: string | undefined): number | string {
  if (raw === undefined || raw === "") return 20;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return "limit must be an integer from 1 to 100.";
  }
  return parsed;
}

type MockEnv = { Variables: { requestId: string } };

const TOO_LARGE = Symbol("too-large");

export function createMockApp(options: MockAppOptions = {}): Hono<MockEnv> {
  const keys = new Set([SANDBOX_API_KEY, ...(options.apiKeys ?? [])]);
  const store: Store = createSeed();
  const app = new Hono<MockEnv>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? `req_${randomBytes(4).toString("hex")}`;
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  });

  app.get("/", (c) =>
    c.json({
      service: "harborline",
      mode: "sandbox",
      health: "/health",
      note: "Fictional sample data for the mcp-rest-api-server portfolio demo.",
    }),
  );

  app.get("/health", (c) => c.json({ ok: true, service: "harborline", mode: "sandbox" }));

  app.use("/v1/*", async (c, next) => {
    const requestId = c.get("requestId");
    const headerKey = c.req.header("x-api-key");
    const authorization = c.req.header("authorization");
    const bearer = authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : undefined;
    const presented = headerKey ?? bearer;
    if (!presented || !keys.has(presented)) {
      return apiError(
        c,
        401,
        "unauthorized",
        "Provide a valid API key as Authorization: Bearer or x-api-key.",
        requestId,
      );
    }
    await next();
  });

  app.get("/v1/summary", (c) => c.json({ data: summarize(store) }));
  app.get("/v1/contract", (c) => c.json({ data: apiContract }));

  app.get("/v1/projects", (c) => {
    const requestId = c.get("requestId");
    const limit = queryLimit(c.req.query("limit"));
    if (typeof limit === "string") return apiError(c, 400, "validation", limit, requestId);
    const projects = [...store.projects].sort((a, b) => a.id.localeCompare(b.id));
    try {
      return c.json(paginate(projects, c.req.query("cursor"), limit));
    } catch (error) {
      if (error instanceof ApiError) return apiError(c, 400, error.code, error.message, requestId);
      throw error;
    }
  });

  app.get("/v1/projects/:id", (c) => {
    const requestId = c.get("requestId");
    const project = store.projects.find((item) => item.id === c.req.param("id"));
    if (!project) return apiError(c, 404, "not_found", `Project ${c.req.param("id")} was not found.`, requestId);
    return c.json({ data: project });
  });

  app.get("/v1/tasks", (c) => {
    const requestId = c.get("requestId");
    const limit = queryLimit(c.req.query("limit"));
    if (typeof limit === "string") return apiError(c, 400, "validation", limit, requestId);
    const statusRaw = c.req.query("status");
    if (statusRaw) {
      const parsed = TaskStatusSchema.safeParse(statusRaw);
      if (!parsed.success) return apiError(c, 400, "validation", "status is not a known task status.", requestId);
    }
    const projectId = c.req.query("projectId");
    const assigneeId = c.req.query("assigneeId");
    const tasks = store.tasks
      .filter((task) => (projectId ? task.projectId === projectId : true))
      .filter((task) => (statusRaw ? task.status === statusRaw : true))
      .filter((task) => (assigneeId ? task.assigneeId === assigneeId : true))
      .sort((a, b) => a.id.localeCompare(b.id));
    try {
      return c.json(paginate(tasks, c.req.query("cursor"), limit));
    } catch (error) {
      if (error instanceof ApiError) return apiError(c, 400, error.code, error.message, requestId);
      throw error;
    }
  });

  app.get("/v1/tasks/:id", (c) => {
    const requestId = c.get("requestId");
    const task = store.tasks.find((item) => item.id === c.req.param("id"));
    if (!task) return apiError(c, 404, "not_found", `Task ${c.req.param("id")} was not found.`, requestId);
    return c.json({ data: task });
  });

  app.post("/v1/tasks", async (c) => {
    const requestId = c.get("requestId");
    const raw = await readJson(c);
    if (raw === TOO_LARGE) return apiError(c, 400, "validation", "Request body is too large.", requestId);
    if (raw === undefined) return apiError(c, 400, "validation", "Request body must be JSON.", requestId);
    const parsed = CreateTaskSchema.safeParse(raw);
    if (!parsed.success) return apiError(c, 400, "validation", zodMessage(parsed.error), requestId);
    const input = parsed.data;
    if (!store.projects.some((project) => project.id === input.projectId)) {
      return apiError(c, 404, "not_found", `Project ${input.projectId} was not found.`, requestId);
    }
    if (input.assigneeId && !store.contacts.some((contact) => contact.id === input.assigneeId)) {
      return apiError(c, 400, "validation", `Assignee ${input.assigneeId} was not found.`, requestId);
    }
    const task: Task = {
      id: newId("tsk"),
      projectId: input.projectId,
      title: input.title,
      status: input.status ?? "todo",
      priority: input.priority ?? "medium",
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
    };
    store.tasks.push(task);
    return c.json({ data: task }, 201);
  });

  app.patch("/v1/tasks/:id", async (c) => {
    const requestId = c.get("requestId");
    const task = store.tasks.find((item) => item.id === c.req.param("id"));
    if (!task) return apiError(c, 404, "not_found", `Task ${c.req.param("id")} was not found.`, requestId);
    const raw = await readJson(c);
    if (raw === TOO_LARGE) return apiError(c, 400, "validation", "Request body is too large.", requestId);
    if (raw === undefined) return apiError(c, 400, "validation", "Request body must be JSON.", requestId);
    const parsed = UpdateTaskSchema.safeParse(raw);
    if (!parsed.success) return apiError(c, 400, "validation", zodMessage(parsed.error), requestId);
    const input = parsed.data;
    if (input.assigneeId && !store.contacts.some((contact) => contact.id === input.assigneeId)) {
      return apiError(c, 400, "validation", `Assignee ${input.assigneeId} was not found.`, requestId);
    }
    if (input.title !== undefined) task.title = input.title;
    if (input.status !== undefined) task.status = input.status;
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.assigneeId !== undefined) task.assigneeId = input.assigneeId;
    if (input.dueDate !== undefined) task.dueDate = input.dueDate;
    return c.json({ data: task });
  });

  app.get("/v1/contacts", (c) => {
    const requestId = c.get("requestId");
    const limit = queryLimit(c.req.query("limit"));
    if (typeof limit === "string") return apiError(c, 400, "validation", limit, requestId);
    const q = c.req.query("q")?.trim().toLowerCase();
    const contacts = store.contacts
      .filter((contact) => {
        if (!q) return true;
        return [contact.name, contact.email, contact.company, contact.role].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    try {
      return c.json(paginate(contacts, c.req.query("cursor"), limit));
    } catch (error) {
      if (error instanceof ApiError) return apiError(c, 400, error.code, error.message, requestId);
      throw error;
    }
  });

  app.get("/v1/contacts/:id", (c) => {
    const requestId = c.get("requestId");
    const contact = store.contacts.find((item) => item.id === c.req.param("id"));
    if (!contact) return apiError(c, 404, "not_found", `Contact ${c.req.param("id")} was not found.`, requestId);
    return c.json({ data: contact });
  });

  app.post("/v1/contacts", async (c) => {
    const requestId = c.get("requestId");
    const raw = await readJson(c);
    if (raw === TOO_LARGE) return apiError(c, 400, "validation", "Request body is too large.", requestId);
    if (raw === undefined) return apiError(c, 400, "validation", "Request body must be JSON.", requestId);
    const parsed = CreateContactSchema.safeParse(raw);
    if (!parsed.success) return apiError(c, 400, "validation", zodMessage(parsed.error), requestId);
    const input = parsed.data;
    const email = input.email.toLowerCase();
    if (store.contacts.some((contact) => contact.email.toLowerCase() === email)) {
      return apiError(c, 409, "conflict", `A contact with email ${input.email} already exists.`, requestId);
    }
    const contact: Contact = {
      id: newId("con"),
      name: input.name,
      email: input.email,
      company: input.company,
      role: input.role,
      phone: input.phone ?? null,
    };
    store.contacts.push(contact);
    return c.json({ data: contact }, 201);
  });

  app.notFound((c) => {
    const requestId = c.get("requestId") || "req_unknown";
    return apiError(c, 404, "not_found", `No route for ${c.req.method} ${c.req.path}.`, requestId);
  });

  return app;
}

async function readJson(c: { req: { json: () => Promise<unknown>; header: (name: string) => string | undefined } }): Promise<unknown> {
  const length = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(length) && length > 100_000) {
    return TOO_LARGE;
  }
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function zodMessage(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "Request body is invalid.";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`.slice(0, 300);
}

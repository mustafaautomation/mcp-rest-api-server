import { SERVER_NAME, VERSION } from "./version.js";

/** Static description of the sample API. Replace this when you wrap a different service. */
export const apiContract = {
  name: "Harborline",
  version: "1.0.0",
  server: SERVER_NAME,
  serverVersion: VERSION,
  note: "Fictional sandbox data shipped with the portfolio demo. Point API_BASE_URL at a real service and replace the schemas.",
  auth: {
    schemes: ["Authorization: Bearer <API_KEY>", "<API_KEY_HEADER>: <API_KEY>"],
    sandboxKey: "sandbox-demo-key",
    sandboxNote: "The bundled API accepts sandbox-demo-key. A real API_KEY is never returned here.",
  },
  pagination: {
    style: "cursor",
    query: ["cursor", "limit"],
    limit: { default: 20, max: 100 },
    response: "page.nextCursor",
    rule: "Pass page.nextCursor back as cursor. Omit cursor for the first page. Do not invent cursors.",
  },
  endpoints: [
    { method: "GET", path: "/health", auth: false, description: "Liveness probe." },
    { method: "GET", path: "/v1/summary", auth: true, description: "Counts for projects, tasks, and contacts." },
    { method: "GET", path: "/v1/projects", auth: true, query: ["cursor", "limit"] },
    { method: "GET", path: "/v1/projects/{id}", auth: true },
    { method: "GET", path: "/v1/tasks", auth: true, query: ["cursor", "limit", "projectId", "status", "assigneeId"] },
    { method: "GET", path: "/v1/tasks/{id}", auth: true },
    { method: "POST", path: "/v1/tasks", auth: true, write: true },
    { method: "PATCH", path: "/v1/tasks/{id}", auth: true, write: true },
    { method: "GET", path: "/v1/contacts", auth: true, query: ["cursor", "limit", "q"] },
    { method: "GET", path: "/v1/contacts/{id}", auth: true },
    { method: "POST", path: "/v1/contacts", auth: true, write: true },
    { method: "GET", path: "/v1/contract", auth: true, description: "This document." },
  ],
  errors: {
    shape: { error: { code: "string", message: "string", requestId: "string" } },
    codes: ["unauthorized", "not_found", "validation", "conflict"],
  },
} as const;

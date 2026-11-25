import { afterEach, describe, expect, it } from "vitest";
import { createSeed, summarize } from "../src/mock/data.js";
import { SANDBOX_API_KEY } from "../src/mock/constants.js";
import { startMockApi, type MockServer } from "../src/mock/server.js";

let server: MockServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function boot(): Promise<MockServer> {
  server = await startMockApi({ port: 0 });
  return server;
}

function auth(key = SANDBOX_API_KEY): Record<string, string> {
  return { authorization: `Bearer ${key}` };
}

describe("harborline sandbox", () => {
  it("requires a key and serves the seeded summary", async () => {
    const mock = await boot();
    const denied = await fetch(`${mock.url}/v1/summary`);
    expect(denied.status).toBe(401);
    const health = await fetch(`${mock.url}/health`);
    expect(health.status).toBe(200);
    const summary = await fetch(`${mock.url}/v1/summary`, { headers: auth() });
    expect(summary.status).toBe(200);
    const body = (await summary.json()) as { data: unknown };
    expect(body.data).toEqual(summarize(createSeed()));
  });

  it("accepts either auth style and walks every project page", async () => {
    const mock = await boot();
    const header = await fetch(`${mock.url}/v1/projects?limit=2`, { headers: { "x-api-key": SANDBOX_API_KEY } });
    expect(header.status).toBe(200);
    const ids: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const path = cursor
        ? `/v1/projects?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "/v1/projects?limit=2";
      const response = await fetch(`${mock.url}${path}`, { headers: auth() });
      const body = (await response.json()) as {
        data: { id: string }[];
        page: { nextCursor: string | null };
      };
      ids.push(...body.data.map((project) => project.id));
      cursor = body.page.nextCursor;
      guard += 1;
    } while (cursor && guard < 10);
    expect(ids).toEqual(createSeed().projects.map((project) => project.id).sort());
  });

  it("creates a task and rejects a duplicate contact", async () => {
    const mock = await boot();
    const created = await fetch(`${mock.url}/v1/tasks`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({ projectId: "prj_northline", title: "Send the proof" }),
    });
    expect(created.status).toBe(201);
    const task = (await created.json()) as { data: { id: string; title: string } };
    const fetched = await fetch(`${mock.url}/v1/tasks/${task.data.id}`, { headers: auth() });
    expect(fetched.status).toBe(200);
    const duplicate = await fetch(`${mock.url}/v1/contacts`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({
        name: "Jonah Ellis",
        email: "jonah@northline.example",
        company: "Northline Goods",
        role: "Marketing director",
      }),
    });
    expect(duplicate.status).toBe(409);
    const missing = await fetch(`${mock.url}/v1/projects/prj_missing`, { headers: auth() });
    expect(missing.status).toBe(404);
    const badCursor = await fetch(`${mock.url}/v1/projects?cursor=nope`, { headers: auth() });
    expect(badCursor.status).toBe(400);
  });
});

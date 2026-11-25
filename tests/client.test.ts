import { createServer, type RequestListener, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { RestClient } from "../src/api/client.js";
import { ApiError } from "../src/api/errors.js";
import { loadConfig, type AppConfig } from "../src/config.js";
import type { LogSink } from "../src/log.js";
import { createLogger } from "../src/log.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => close(server)));
});

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function listen(handler: RequestListener): Promise<{ url: string; port: number }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { url: `http://127.0.0.1:${address.port}`, port: address.port };
}

function configFor(url: string, env: Record<string, string> = {}, patch: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      env: {
        API_BASE_URL: url,
        API_KEY: "test-key-value",
        API_MAX_RETRIES: "2",
        API_RETRY_BASE_MS: "0",
        API_RETRY_MAX_MS: "50",
        API_RATE_LIMIT_RPS: "1000",
        API_RATE_LIMIT_BURST: "100",
        API_TIMEOUT_MS: "500",
        LOG_LEVEL: "silent",
        MCP_READ_ONLY: "false",
        ...env,
      },
    }),
    ...patch,
  };
}

const summaryBody = {
  data: {
    projects: 1,
    tasks: 0,
    contacts: 0,
    tasksByStatus: { todo: 0, in_progress: 0, blocked: 0, done: 0 },
  },
};

const taskBody = {
  data: {
    id: "tsk_new",
    projectId: "prj_northline",
    title: "Follow up",
    status: "todo",
    priority: "medium",
    assigneeId: null,
    dueDate: null,
  },
};

describe("rest client", () => {
  it("retries a safe request and then succeeds", async () => {
    let hits = 0;
    const { url } = await listen((_req, res) => {
      hits += 1;
      if (hits < 3) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "busy" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(summaryBody));
    });
    const client = new RestClient(configFor(url), { random: () => 0 });
    await expect(client.getSummary()).resolves.toMatchObject({ projects: 1 });
    expect(hits).toBe(3);
  });

  it("does not retry a validation error or a failed write", async () => {
    let gets = 0;
    let posts = 0;
    const { url } = await listen((req, res) => {
      if (req.method === "POST") posts += 1;
      else gets += 1;
      res.writeHead(req.method === "POST" ? 500 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "no" } }));
    });
    const client = new RestClient(configFor(url), { random: () => 0 });
    await expect(client.listProjects()).rejects.toMatchObject({ code: "validation" });
    await expect(
      client.createTask({ projectId: "prj_northline", title: "Follow up" }),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(gets).toBe(1);
    expect(posts).toBe(1);
  });

  it("retries a rate-limited write and honors Retry-After", async () => {
    const waits: number[] = [];
    let hits = 0;
    const { url } = await listen((_req, res) => {
      hits += 1;
      if (hits === 1) {
        res.writeHead(429, { "content-type": "application/json", "retry-after": "0" });
        res.end(JSON.stringify({ error: { message: "slow down" } }));
        return;
      }
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify(taskBody));
    });
    const client = new RestClient(configFor(url, { API_MAX_RETRIES: "1" }), {
      random: () => 1,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const task = await client.createTask({ projectId: "prj_northline", title: "Follow up" });
    expect(task.id).toBe("tsk_new");
    expect(hits).toBe(2);
    expect(waits).toContain(0);
  });

  it("blocks writes in read-only mode before the request", async () => {
    let hits = 0;
    const { url } = await listen((_req, res) => {
      hits += 1;
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify(taskBody));
    });
    const client = new RestClient(configFor(url, { MCP_READ_ONLY: "true" }));
    await expect(client.createTask({ projectId: "prj_northline", title: "Nope" })).rejects.toBeInstanceOf(ApiError);
    await expect(client.createTask({ projectId: "prj_northline", title: "Nope" })).rejects.toMatchObject({
      code: "read_only",
    });
    expect(hits).toBe(0);
  });

  it("sends the selected auth header and scrubs a reflected key", async () => {
    const secret = "test-key-value";
    let authorization: string | undefined;
    let apiKey: string | undefined;
    const lines: string[] = [];
    const sink: LogSink = (_level, message, fields) => {
      lines.push(`${message} ${JSON.stringify(fields)}`);
    };
    const { url } = await listen((req, res) => {
      authorization = req.headers.authorization;
      apiKey = req.headers["x-api-key"] as string | undefined;
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `rejected ${secret}` } }));
    });
    const client = new RestClient(configFor(url, { API_AUTH_STYLE: "both", API_MAX_RETRIES: "0" }), {
      log: createLogger({ level: "info", secrets: [secret], sink }),
    });
    await expect(client.getSummary()).rejects.toMatchObject({ code: "unauthorized", message: "rejected [redacted]" });
    expect(authorization).toBe(`Bearer ${secret}`);
    expect(apiKey).toBe(secret);
    expect(lines.join("\n")).not.toContain(secret);
  });

  it("retries a connection that never left the machine", async () => {
    const held = createServer((_req, res) => {
      res.end();
    });
    await new Promise<void>((resolve, reject) => {
      held.once("error", reject);
      held.listen(0, "127.0.0.1", () => resolve());
    });
    const address = held.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const port = address.port;
    await close(held);
    let calls = 0;
    const client = new RestClient(configFor(`http://127.0.0.1:${port}`, { API_MAX_RETRIES: "1" }), {
      random: () => 0,
      fetchImpl: async (input, init) => {
        calls += 1;
        return fetch(input, init);
      },
    });
    await expect(client.getSummary()).rejects.toMatchObject({ code: "network" });
    expect(calls).toBe(2);
  });
});

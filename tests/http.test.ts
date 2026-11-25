import { request as httpRequest } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { startHttpTransport, type HttpTransport } from "../src/http.js";
import { startMockApi, type MockServer } from "../src/mock/server.js";
import { createRuntime } from "../src/runtime.js";

const mocks: MockServer[] = [];
const https: HttpTransport[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(https.splice(0).map((server) => server.close()));
  await Promise.all(mocks.splice(0).map((mock) => mock.close()));
});

describe("streamable http", () => {
  it("serves MCP and rejects a foreign host", async () => {
    const mock = await startMockApi({ port: 0 });
    mocks.push(mock);
    const runtime = createRuntime(
      loadConfig({
        env: {
          API_BASE_URL: mock.url,
          API_KEY: "sandbox-demo-key",
          LOG_LEVEL: "silent",
          MCP_HTTP_HOST: "127.0.0.1",
          MCP_HTTP_PORT: "0",
        },
      }),
    );
    const http = await startHttpTransport(runtime, { host: "127.0.0.1", port: 0 });
    https.push(http);

    const health = await fetch(`${http.url}/health`);
    expect(health.status).toBe(200);

    const client = new Client({ name: "http-test", version: "0.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${http.url}/mcp`)));
    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === "list_projects")).toBe(true);
    const summary = await client.callTool({ name: "get_workspace_summary", arguments: {} });
    expect(summary.isError).not.toBe(true);

    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: http.port,
          path: "/mcp",
          method: "POST",
          headers: { host: "evil.example", "content-type": "application/json", accept: "application/json" },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end("{}");
    });
    expect(status).toBe(403);
  });

  it("requires the MCP bearer token when one is configured", async () => {
    const mock = await startMockApi({ port: 0 });
    mocks.push(mock);
    const token = "mcp-http-token";
    const runtime = createRuntime(
      loadConfig({
        env: {
          API_BASE_URL: mock.url,
          API_KEY: "sandbox-demo-key",
          MCP_HTTP_TOKEN: token,
          LOG_LEVEL: "silent",
        },
      }),
    );
    const http = await startHttpTransport(runtime, { host: "127.0.0.1", port: 0 });
    https.push(http);

    const denied = await fetch(`${http.url}/mcp`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(denied.status).toBe(401);
    const deniedText = await denied.text();
    expect(deniedText).not.toContain(token);

    const client = new Client({ name: "http-test", version: "0.0.0" });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${http.url}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
  });
});

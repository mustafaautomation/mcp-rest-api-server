import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoRuntime } from "../src/demo-runtime.js";
import { startHttpTransport, type HttpTransport } from "../src/http.js";

const servers: HttpTransport[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("hosted demo runtime", () => {
  it("serves read-only Harborline tools without a separate API process", async () => {
    const http = await startHttpTransport(createDemoRuntime(), { host: "127.0.0.1", port: 0 });
    servers.push(http);
    const client = new Client({ name: "demo-runtime-test", version: "0.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${http.url}/mcp`)));
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).not.toContain("create_task");
    const listed = await client.callTool({ name: "list_projects", arguments: { limit: 1 } });
    expect(listed.isError).not.toBe(true);
    expect(JSON.stringify(listed.structuredContent)).toContain("prj_");

    const card = await fetch(`${http.url}/mcp`);
    expect(card.status).toBe(200);
    const body = (await card.json()) as { readOnly: boolean; mcp: string };
    expect(body.readOnly).toBe(true);
    expect(body.mcp).toBe("/mcp");
  });
});

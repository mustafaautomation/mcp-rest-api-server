import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "../src/config.js";
import { createSeed } from "../src/mock/data.js";
import { startMockApi, type MockServer } from "../src/mock/server.js";
import { createRuntime } from "../src/runtime.js";

const secret = "super-secret-key-value";
const mocks: MockServer[] = [];
const servers: McpServer[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(mocks.splice(0).map((mock) => mock.close()));
});

async function connect(env: Record<string, string>) {
  const mock = await startMockApi({ port: 0, apiKeys: [secret] });
  mocks.push(mock);
  const runtime = createRuntime(
    loadConfig({
      env: {
        API_BASE_URL: mock.url,
        API_KEY: secret,
        LOG_LEVEL: "silent",
        API_RATE_LIMIT_RPS: "1000",
        API_RATE_LIMIT_BURST: "200",
        ...env,
      },
    }),
  );
  const mcp = runtime.createServer();
  servers.push(mcp);
  const client = new Client({ name: "mcp-rest-api-server-test", version: "0.0.0" });
  clients.push(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), mcp.connect(serverTransport)]);
  return client;
}

function textOf(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result) || !Array.isArray(result.content)) return "";
  return result.content
    .map((item) => {
      if (!item || typeof item !== "object" || !("text" in item) || typeof item.text !== "string") return "";
      return item.text;
    })
    .join("\n");
}

function resourceText(contents: readonly { text?: string; blob?: string }[]): string {
  return contents.map((item) => item.text ?? "").join("\n");
}

describe("mcp server", () => {
  it("exposes read tools, resources, and a prompt", async () => {
    const client = await connect({ MCP_READ_ONLY: "true" });
    expect(client.getInstructions()).toContain("read-only");
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        "get_contact",
        "get_project",
        "get_task",
        "get_workspace_summary",
        "list_contacts",
        "list_projects",
        "list_tasks",
      ].sort(),
    );
    expect(names).not.toContain("create_task");

    const listed = await client.callTool({ name: "list_projects", arguments: { limit: 2 } });
    expect(listed.isError).not.toBe(true);
    const page = listed.structuredContent as { projects: { id: string }[]; nextCursor: string; hasMore: boolean };
    expect(page.projects).toHaveLength(2);
    expect(page.hasMore).toBe(true);

    const ids = [...page.projects.map((project) => project.id)];
    let cursor: string | null = page.nextCursor;
    while (cursor) {
      const next = await client.callTool({ name: "list_projects", arguments: { limit: 2, cursor } });
      const body = next.structuredContent as { projects: { id: string }[]; nextCursor: string | null };
      ids.push(...body.projects.map((project) => project.id));
      cursor = body.nextCursor;
    }
    expect(ids).toEqual(createSeed().projects.map((project) => project.id).sort());

    const project = await client.callTool({ name: "get_project", arguments: { projectId: "prj_northline" } });
    expect(JSON.stringify(project.structuredContent)).toContain("Northline website redesign");

    const bad = await client.callTool({ name: "list_projects", arguments: { limit: 0 } });
    expect(bad.isError).toBe(true);

    const resource = await client.readResource({ uri: "harborline://projects/prj_northline" });
    const body = resourceText(resource.contents);
    expect(body).toContain("Product photography");
    expect(body).not.toContain(secret);

    const contract = await client.readResource({ uri: "harborline://contract" });
    expect(resourceText(contract.contents)).not.toContain(secret);
    expect(resourceText(contract.contents)).toContain("cursor");

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.some((item) => item.uriTemplate === "harborline://projects/{projectId}")).toBe(
      true,
    );

    const prompt = await client.getPrompt({ name: "project-status-brief", arguments: { projectId: "prj_northline" } });
    expect(JSON.stringify(prompt)).toContain("Northline website redesign");
    expect(JSON.stringify(prompt)).toContain("blocked");
  });

  it("returns a structured auth error that does not contain the key", async () => {
    const mock = await startMockApi({ port: 0 });
    mocks.push(mock);
    const runtime = createRuntime(
      loadConfig({
        env: {
          API_BASE_URL: mock.url,
          API_KEY: "wrong-key-not-valid",
          LOG_LEVEL: "silent",
          API_MAX_RETRIES: "0",
        },
      }),
    );
    const mcp = runtime.createServer();
    servers.push(mcp);
    const client = new Client({ name: "mcp-rest-api-server-test", version: "0.0.0" });
    clients.push(client);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), mcp.connect(serverTransport)]);
    const result = await client.callTool({ name: "get_workspace_summary", arguments: {} });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain("unauthorized");
    expect(text).not.toContain("wrong-key-not-valid");
  });

  it("registers write tools only when read-only mode is off", async () => {
    const client = await connect({ MCP_READ_ONLY: "false" });
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("create_task");
    expect(tools.tools.map((tool) => tool.name)).toContain("update_task");
    const created = await client.callTool({
      name: "create_task",
      arguments: { projectId: "prj_roller", title: "Confirm the Friday class", priority: "high" },
    });
    expect(created.isError).not.toBe(true);
    const task = (created.structuredContent as { task: { id: string; title: string; priority: string } }).task;
    expect(task.priority).toBe("high");
    const fetched = await client.callTool({ name: "get_task", arguments: { taskId: task.id } });
    expect(JSON.stringify(fetched.structuredContent)).toContain("Confirm the Friday class");

    const empty = await client.callTool({ name: "update_task", arguments: { taskId: task.id } });
    expect(empty.isError).toBe(true);
    expect(textOf(empty)).toContain("at least one field");

    const email = await client.getPrompt({
      name: "client-update-email",
      arguments: { projectId: "prj_northline", tone: "warm" },
    });
    expect(JSON.stringify(email)).toContain("Jonah Ellis");
  });
});

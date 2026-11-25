import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";
import { startMockApi, type MockServer } from "../src/mock/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules/tsx/dist/cli.mjs");
const clients: Client[] = [];
const mocks: MockServer[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(mocks.splice(0).map((mock) => mock.close()));
});

function run(args: string[], env: Record<string, string> = {}): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsx, "src/cli.ts", ...args], {
      cwd: root,
      env: { ...process.env, LOG_LEVEL: "silent", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

describe("stdio cli", () => {
  it("prints the version on stdout and keeps the key off the help text", async () => {
    const version = await run(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toBe(VERSION);
    const help = await run(["--help"]);
    expect(help.stdout).toContain("Portfolio demo, not client work");
    expect(help.stdout).not.toContain("sandbox-demo-key");
  });

  it("speaks MCP over stdio against the sandbox", async () => {
    const mock = await startMockApi({ port: 0 });
    mocks.push(mock);
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    clients.push(client);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsx, "src/cli.ts"],
      cwd: root,
      stderr: "pipe",
      env: {
        API_BASE_URL: mock.url,
        API_KEY: "sandbox-demo-key",
        MCP_READ_ONLY: "true",
        LOG_LEVEL: "silent",
      },
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("list_contacts");
    const listed = await client.callTool({ name: "list_contacts", arguments: { q: "Jonah", limit: 5 } });
    expect(JSON.stringify(listed.structuredContent)).toContain("jonah@northline.example");
    expect(stderr).not.toContain("sandbox-demo-key");
    await client.close();
  });
});

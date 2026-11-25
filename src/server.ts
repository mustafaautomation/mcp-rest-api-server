import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RestClient } from "./api/client.js";
import type { AppConfig } from "./config.js";
import { registerPrompts } from "./mcp/prompts.js";
import { registerResources } from "./mcp/resources.js";
import { registerTools } from "./mcp/tools.js";
import { SERVER_NAME, VERSION } from "./version.js";

export function buildInstructions(config: AppConfig): string {
  const mode = config.readOnly
    ? "The server is in read-only mode. Write tools are not registered. Do not invent a way to mutate data."
    : "The server can create and update records. Confirm a change with the user before calling a write tool.";
  return [
    "This MCP server wraps a REST API. With no API_BASE_URL it serves the bundled Harborline sandbox, which is fictional project-ops data (projects, tasks, contacts).",
    mode,
    "List tools accept limit and cursor. Pass nextCursor back as cursor. Omit cursor for the first page. Never invent cursors or ids; call a list tool first.",
    "Resources harborline://workspace/summary, harborline://contract, and harborline://projects/{projectId} are snapshots. Prompts project-status-brief and client-update-email load live data.",
    "If a call fails, use the error code. Do not retry unauthorized or validation errors with the same input.",
    "The API key is configured outside the chat. Never ask the user to paste it, and never echo it.",
  ].join(" ");
}

export function createMcpServer(config: AppConfig, client: RestClient): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION, title: "MCP REST API Server" },
    { instructions: buildInstructions(config) },
  );
  registerTools(server, client, config);
  registerResources(server, client, config);
  registerPrompts(server, client, config);
  return server;
}

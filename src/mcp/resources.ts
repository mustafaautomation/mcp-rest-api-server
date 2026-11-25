import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RestClient } from "../api/client.js";
import type { AppConfig } from "../config.js";
import { apiContract } from "../contract.js";
import { SERVER_NAME, VERSION } from "../version.js";

function jsonResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function registerResources(server: McpServer, client: RestClient, config: AppConfig): void {
  server.registerResource(
    "workspace-summary",
    "harborline://workspace/summary",
    {
      title: "Workspace summary",
      description: "Live counts for the wrapped API, plus whether this MCP server is read-only.",
      mimeType: "application/json",
    },
    async (uri) => {
      const summary = await client.getSummary();
      return jsonResource(uri.href, {
        summary,
        server: { name: SERVER_NAME, version: VERSION, readOnly: config.readOnly },
      });
    },
  );

  server.registerResource(
    "api-contract",
    "harborline://contract",
    {
      title: "API contract",
      description: "Auth, pagination, and endpoints for the wrapped API. The sandbox key is public demo data.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri.href, apiContract),
  );

  server.registerResource(
    "project",
    new ResourceTemplate("harborline://projects/{projectId}", {
      list: async () => {
        const projects = await client.listProjects({ limit: 100 });
        return {
          resources: projects.data.map((project) => ({
            uri: `harborline://projects/${project.id}`,
            name: project.name,
            mimeType: "application/json",
            description: project.summary,
          })),
        };
      },
      complete: {
        projectId: async (value) => {
          const projects = await client.listProjects({ limit: 100 });
          return projects.data
            .map((project) => project.id)
            .filter((id) => id.startsWith(value))
            .slice(0, 20);
        },
      },
    }),
    {
      title: "Project",
      description: "One project plus its tasks. Use a project id from list_projects.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const raw = variables.projectId;
      const projectId = Array.isArray(raw) ? raw[0] : raw;
      if (!projectId) {
        throw new Error("projectId is required.");
      }
      const project = await client.getProject(projectId);
      const tasks = await client.listTasks({ projectId, limit: 100 });
      return jsonResource(uri.href, {
        project,
        tasks: tasks.data,
        hasMoreTasks: tasks.page.hasMore,
      });
    },
  );
}

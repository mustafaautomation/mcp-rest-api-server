import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RestClient } from "../api/client.js";
import { ApiError } from "../api/errors.js";
import { scrubText } from "../redact.js";
import type { AppConfig } from "../config.js";

export function registerPrompts(server: McpServer, client: RestClient, config: AppConfig): void {
  const secrets = [config.apiKey, config.httpToken ?? ""];

  server.registerPrompt(
    "project-status-brief",
    {
      title: "Project status brief",
      description: "Draft a status brief from a live Harborline project and its tasks.",
      argsSchema: {
        projectId: z.string().describe("Project id, for example prj_northline."),
      },
    },
    async ({ projectId }) => {
      const loaded = await loadProject(client, projectId, secrets);
      if (!loaded.ok) {
        return userPrompt(
          `The project ${projectId} could not be loaded (${loaded.code}). ${loaded.message} Ask the user for a valid project id from list_projects.`,
        );
      }
      const { project, tasks } = loaded;
      const lines = tasks.map(
        (task) => `- [${task.status}] ${task.title} (${task.priority}${task.dueDate ? `, due ${task.dueDate}` : ""})`,
      );
      return userPrompt(
        [
          `Write a status brief for ${project.name} (${project.id}).`,
          `Client: ${project.client}. Owner contact id: ${project.ownerId}. Due: ${project.dueDate}. Status: ${project.status}.`,
          `Summary: ${project.summary}`,
          "",
          "Tasks:",
          lines.length > 0 ? lines.join("\n") : "- No tasks.",
          "",
          "Use only the facts above. Include: current status, blockers, and the next three actions. Keep it under 180 words. Do not invent dates, owners, or metrics.",
        ].join("\n"),
      );
    },
  );

  server.registerPrompt(
    "client-update-email",
    {
      title: "Client update email",
      description: "Draft a short client update email from a live project. Tone can be plain, warm, or formal.",
      argsSchema: {
        projectId: z.string().describe("Project id, for example prj_northline."),
        tone: z.enum(["plain", "warm", "formal"]).optional().describe("Defaults to plain."),
      },
    },
    async ({ projectId, tone }) => {
      const loaded = await loadProject(client, projectId, secrets);
      if (!loaded.ok) {
        return userPrompt(
          `The project ${projectId} could not be loaded (${loaded.code}). ${loaded.message} Do not draft an email until a real project is loaded.`,
        );
      }
      const { project, tasks } = loaded;
      const contacts = await client.listContacts({ limit: 100 });
      const external = contacts.data.find(
        (contact) =>
          contact.company.toLowerCase() === project.client.toLowerCase() && contact.company.toLowerCase() !== "harborline",
      );
      const blocked = tasks.filter((task) => task.status === "blocked");
      const done = tasks.filter((task) => task.status === "done");
      return userPrompt(
        [
          `Draft a client update email about ${project.name}.`,
          `Tone: ${tone ?? "plain"}.`,
          external ? `Address it to ${external.name} (${external.role}, ${external.company}).` : `Address it to the ${project.client} team.`,
          `Project status: ${project.status}. Due: ${project.dueDate}.`,
          `Completed tasks: ${done.map((task) => task.title).join(", ") || "none"}.`,
          `Blocked tasks: ${blocked.map((task) => task.title).join(", ") || "none"}.`,
          `Open tasks: ${tasks
            .filter((task) => task.status === "todo" || task.status === "in_progress")
            .map((task) => task.title)
            .join(", ") || "none"}.`,
          "Keep it under 150 words. Do not promise dates that are not listed. Do not mention internal contact ids.",
        ].join("\n"),
      );
    },
  );
}

function userPrompt(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

async function loadProject(client: RestClient, projectId: string, secrets: readonly string[]) {
  try {
    const project = await client.getProject(projectId);
    const tasks = await client.listTasks({ projectId, limit: 100 });
    return { ok: true as const, project, tasks: tasks.data };
  } catch (error) {
    const api =
      error instanceof ApiError
        ? error
        : new ApiError({ code: "upstream", message: "The project could not be loaded.", retryable: false });
    return { ok: false as const, code: api.code, message: scrubText(api.message, secrets) };
  }
}

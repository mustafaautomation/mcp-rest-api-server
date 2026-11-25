import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distCli = join(root, "dist/cli.js");
const serverArgs = existsSync(distCli)
  ? [distCli]
  : [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "src/cli.ts")];

const dim = (value: string): string => `\x1b[2m${value}\x1b[22m`;
const bold = (value: string): string => `\x1b[1m${value}\x1b[22m`;
const accent = (value: string): string => `\x1b[38;5;173m${value}\x1b[39m`;
const green = (value: string): string => `\x1b[38;5;108m${value}\x1b[39m`;

function shortCursor(cursor: string): string {
  return cursor.length > 22 ? `${cursor.slice(0, 16)}…` : cursor;
}

function projectsOf(result: unknown): { id: string; name: string; status: string }[] {
  if (!result || typeof result !== "object" || !("structuredContent" in result)) return [];
  const body = result.structuredContent as { projects?: { id: string; name: string; status: string }[] } | undefined;
  return body?.projects ?? [];
}

async function main(): Promise<void> {
  console.log();
  console.log(`${accent("mcp-rest-api-server")}  ${dim("Harborline sandbox")}`);
  console.log(dim("portfolio demo · read-only · stdio · no external account"));
  console.log();

  const client = new Client({ name: "mcp-rest-api-server-demo", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: serverArgs,
    cwd: root,
    stderr: "pipe",
    env: {
      MCP_READ_ONLY: "true",
      LOG_LEVEL: "error",
    },
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  await client.connect(transport);
  const tools = await client.listTools();
  console.log(bold("tools"));
  for (const tool of tools.tools) {
    const label = (tool.title ?? tool.description ?? "").replace(/\.$/, "");
    console.log(`  ${green(tool.name.padEnd(24))} ${dim(label.slice(0, 64))}`);
  }
  console.log();

  const first = await client.callTool({ name: "list_projects", arguments: { limit: 2 } });
  const firstPage = first.structuredContent as {
    projects: { id: string; name: string; status: string }[];
    nextCursor: string;
  };
  console.log(`${bold("list_projects")}  ${dim("{ limit: 2 }")}`);
  for (const project of projectsOf(first)) {
    console.log(`  ${project.id.padEnd(16)} ${project.name.padEnd(34)} ${project.status}`);
  }
  console.log(`  ${dim("nextCursor")} ${shortCursor(firstPage.nextCursor)}`);
  console.log();

  const second = await client.callTool({
    name: "list_projects",
    arguments: { limit: 2, cursor: firstPage.nextCursor },
  });
  console.log(`${bold("list_projects")}  ${dim("{ limit: 2, cursor }")}`);
  for (const project of projectsOf(second)) {
    console.log(`  ${project.id.padEnd(16)} ${project.name.padEnd(34)} ${project.status}`);
  }
  console.log();

  const detail = await client.callTool({ name: "get_project", arguments: { projectId: "prj_northline" } });
  const project = (detail.structuredContent as { project: { name: string; client: string; status: string; dueDate: string } })
    .project;
  console.log(`${bold("get_project")}  ${dim("{ projectId: prj_northline }")}`);
  console.log(`  ${project.name}`);
  console.log(`  ${dim(`${project.client} · ${project.status} · due ${project.dueDate}`)}`);
  console.log();

  const resource = await client.readResource({ uri: "harborline://projects/prj_northline" });
  const raw = resource.contents.map((item) => ("text" in item ? item.text : "")).join("");
  const snapshot = JSON.parse(raw) as { tasks: { status: string }[] };
  const blocked = snapshot.tasks.filter((task) => task.status === "blocked").length;
  console.log(`${bold("resources/read")}  ${dim("harborline://projects/prj_northline")}`);
  console.log(`  ${snapshot.tasks.length} tasks · ${blocked} blocked`);
  console.log();

  const prompt = await client.getPrompt({
    name: "project-status-brief",
    arguments: { projectId: "prj_northline" },
  });
  console.log(`${bold("prompts/get")}  ${dim("project-status-brief")}`);
  console.log(`  ${prompt.messages.length} message · live tasks included`);
  console.log();
  console.log(green("ok"));
  console.log();

  await client.close();
  if (stderr.includes("sandbox-demo-key")) {
    throw new Error("The demo log contained the sandbox key.");
  }
}

const timer = setTimeout(() => {
  console.error("demo timed out");
  process.exit(1);
}, 20_000);

main()
  .then(() => {
    clearTimeout(timer);
    process.exit(0);
  })
  .catch((error: unknown) => {
    clearTimeout(timer);
    console.error(error instanceof Error ? error.message : "demo failed");
    process.exit(1);
  });

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Runtime } from "./runtime.js";

export async function serveStdio(runtime: Runtime): Promise<void> {
  const server = runtime.createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  runtime.log.info("mcp stdio ready", { readOnly: runtime.config.readOnly });
}

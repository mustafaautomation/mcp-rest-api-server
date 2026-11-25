import { RestClient, type ClientDeps } from "./api/client.js";
import type { AppConfig } from "./config.js";
import { createLogger, type Logger } from "./log.js";
import { createMcpServer } from "./server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface Runtime {
  config: AppConfig;
  client: RestClient;
  log: Logger;
  createServer(): McpServer;
}

export function createRuntime(config: AppConfig, deps: ClientDeps = {}): Runtime {
  const secrets = [config.apiKey, config.httpToken ?? ""].filter((value) => value.length >= 6);
  const log = deps.log ?? createLogger({ level: config.logLevel, secrets });
  const client = new RestClient(config, { ...deps, log });
  return {
    config,
    client,
    log,
    createServer() {
      return createMcpServer(config, client);
    },
  };
}

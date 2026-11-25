#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "./cli/args.js";
import { ConfigError, loadConfig, mergeEnv, readEnvFile, type CliOverrides } from "./config.js";
import { startHttpTransport } from "./http.js";
import { scrubText } from "./redact.js";
import { createRuntime } from "./runtime.js";
import { startMockApi, type MockServer } from "./mock/server.js";
import { serveStdio } from "./stdio.js";
import { SERVER_NAME, VERSION } from "./version.js";

const HELP = `${SERVER_NAME} ${VERSION}

Wrap a REST API as an MCP server. With no API_BASE_URL, the bundled Harborline
sandbox starts automatically. Portfolio demo, not client work.

Usage:
  mcp-rest-api-server [stdio] [options]
  mcp-rest-api-server http [options]
  mcp-rest-api-server mock [options]

Commands:
  stdio     Speak MCP on stdin/stdout. This is the default.
  http      Serve MCP on Streamable HTTP at /mcp.
  mock      Run only the Harborline sample API.

Options:
  --base-url <url>     Upstream API. Overrides API_BASE_URL.
  --api-key <key>      Upstream credential. Prefer the API_KEY env var.
  --auth <style>       bearer, api-key, or both.
  --read-only          Register read tools only. This is the default.
  --read-write         Also register create_task, update_task, and create_contact.
  --host <host>        Bind host for http or mock. Default 127.0.0.1.
  --port <port>        Bind port for http (8787) or mock (8788).
  --env-file <path>    Load a .env file. Existing environment wins.
  --log-level <level>  debug, info, warn, error, or silent.
  -h, --help
  -v, --version

Flags are visible to other users on this machine. Put secrets in the environment.

Examples:
  mcp-rest-api-server
  mcp-rest-api-server http --port 8787
  mcp-rest-api-server --read-write
  API_BASE_URL=https://api.example.com API_KEY=... mcp-rest-api-server
`;

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const command = parsed.command ?? "stdio";
  const envFile = parsed.envFile ?? (existsSync(resolve(".env")) ? resolve(".env") : undefined);
  const fileEnv = envFile ? readEnvFile(envFile) : {};
  const env = mergeEnv(fileEnv, process.env);
  const cli: CliOverrides = {
    ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}),
    ...(parsed.apiKey ? { apiKey: parsed.apiKey } : {}),
    ...(parsed.authStyle ? { authStyle: parsed.authStyle } : {}),
    ...(parsed.readOnly !== undefined ? { readOnly: parsed.readOnly } : {}),
    ...(parsed.logLevel ? { logLevel: parsed.logLevel } : {}),
    ...(command !== "mock" && parsed.port !== undefined ? { port: parsed.port } : {}),
    ...(command !== "mock" && parsed.host ? { host: parsed.host } : {}),
  };

  let config = loadConfig({ env, cli });
  if (command === "mock") {
    config = {
      ...config,
      ...(parsed.port !== undefined ? { mockPort: parsed.port } : {}),
      ...(parsed.host ? { mockHost: parsed.host } : {}),
    };
  }

  if (command === "mock") {
    const mock = await startMockApi({
      host: config.mockHost,
      port: config.mockPort,
      apiKeys: [config.apiKey],
    });
    console.error(`${SERVER_NAME} harborline sandbox ${mock.url}`);
    await waitForSignal(mock);
    return;
  }

  let embedded: MockServer | undefined;
  if (config.apiBaseUrlSource === "default") {
    embedded = await startMockApi({ host: "127.0.0.1", port: 0, apiKeys: [config.apiKey] });
    config = { ...config, apiBaseUrl: embedded.url, apiBaseUrlSource: "env" };
    console.error(`${SERVER_NAME} embedded sandbox ${embedded.url}`);
  }

  const runtime = createRuntime(config);
  runtime.log.info("starting", {
    command,
    readOnly: config.readOnly,
    apiBaseUrl: config.apiBaseUrl,
  });

  if (command === "http") {
    const http = await startHttpTransport(runtime);
    console.error(`${SERVER_NAME} streamable http ${http.url}/mcp`);
    await waitForSignal(embedded, http);
    return;
  }

  const stopEmbedded = () => {
    void embedded?.close();
  };
  process.stdin.once("end", stopEmbedded);
  process.stdin.once("close", stopEmbedded);
  process.once("SIGINT", stopEmbedded);
  process.once("SIGTERM", stopEmbedded);
  await serveStdio(runtime);
}

async function waitForSignal(...servers: Array<{ close(): Promise<void> } | undefined>): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = () => {
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  for (const server of servers) {
    await server?.close();
  }
}

main().catch((error: unknown) => {
  const secrets = [process.env.API_KEY ?? "", process.env.MCP_HTTP_TOKEN ?? ""];
  const message = error instanceof ConfigError ? error.message : error instanceof Error ? error.message : "Startup failed.";
  console.error(scrubText(message, secrets));
  process.exit(1);
});

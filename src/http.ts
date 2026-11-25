import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Runtime } from "./runtime.js";
import { SERVER_NAME, VERSION } from "./version.js";

export interface HttpTransport {
  url: string;
  port: number;
  close(): Promise<void>;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function tokensMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function hostnameFromHostHeader(header: string): string | undefined {
  if (header.startsWith("[")) {
    const end = header.indexOf("]");
    if (end === -1) return undefined;
    return header.slice(1, end).toLowerCase();
  }
  const name = header.split(":")[0]?.trim().toLowerCase();
  return name || undefined;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface HttpRequestOptions {
  publicBind: boolean;
  allowedHosts: Set<string>;
  /** `public` is for the read-only hosted demo. Local servers only reflect localhost origins. */
  cors?: "local" | "public";
  /** Answer GET SSE and DELETE with 405. Used by the serverless demo, which only speaks JSON POST. */
  jsonOnly?: boolean;
}

function corsHeaders(origin: string | undefined, mode: "local" | "public"): Record<string, string> {
  const headers: Record<string, string> = {
    vary: "Origin",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers":
      "content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id",
    "access-control-expose-headers": "mcp-session-id",
    "access-control-max-age": "600",
  };
  if (mode === "public") {
    headers["access-control-allow-origin"] = "*";
    return headers;
  }
  if (origin && isLocalOrigin(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string>): void {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...extra,
  });
  res.end(payload);
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}

export function startHttpTransport(
  runtime: Runtime,
  options: { host?: string; port?: number } = {},
): Promise<HttpTransport> {
  const host = options.host ?? runtime.config.httpHost;
  const port = options.port ?? runtime.config.httpPort;
  const publicBind = host === "0.0.0.0" || host === "::";
  const allowedHosts = new Set(LOCAL_HOSTS);
  if (!publicBind) allowedHosts.add(host.toLowerCase());

  if (publicBind && !runtime.config.httpToken) {
    runtime.log.warn("HTTP transport is reachable beyond localhost and MCP_HTTP_TOKEN is unset");
  }

  const server = createServer((req, res) => {
    void handleHttpRequest(req, res, runtime, { publicBind, allowedHosts, cors: "local" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind the MCP HTTP server."));
        return;
      }
      const advertised = publicBind ? "127.0.0.1" : host;
      resolve({
        url: `http://${advertised}:${address.port}`,
        port: address.port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.closeAllConnections();
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

export async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: Runtime,
  bind: HttpRequestOptions,
): Promise<void> {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const cors = corsHeaders(origin, bind.cors ?? "local");
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if ((path === "/health" || path.endsWith("/health")) && req.method === "GET") {
    sendJson(
      res,
      200,
      { ok: true, name: SERVER_NAME, version: VERSION, readOnly: runtime.config.readOnly, transport: "streamable-http" },
      cors,
    );
    return;
  }

  const accept = typeof req.headers.accept === "string" ? req.headers.accept : "";
  const wantsStream = accept.includes("text/event-stream");
  const mcpPath = path === "/mcp" || path.endsWith("/mcp");

  if ((path === "/" || (mcpPath && req.method === "GET" && !wantsStream)) && req.method === "GET") {
    sendJson(
      res,
      200,
      {
        name: SERVER_NAME,
        version: VERSION,
        mcp: "/mcp",
        health: "/health",
        readOnly: runtime.config.readOnly,
      },
      cors,
    );
    return;
  }

  if (bind.jsonOnly && mcpPath && (req.method === "GET" || req.method === "DELETE")) {
    res.writeHead(405, {
      allow: "POST",
      "content-type": "application/json; charset=utf-8",
      ...cors,
    });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
    return;
  }

  const isMcp = mcpPath && (req.method === "POST" || req.method === "GET" || req.method === "DELETE");
  if (!isMcp) {
    sendJson(res, 404, { error: { code: "not_found", message: "Not found." } }, cors);
    return;
  }

  if (!bind.publicBind) {
    const hostHeader = req.headers.host;
    const hostname = hostHeader ? hostnameFromHostHeader(hostHeader) : undefined;
    if (!hostname || !bind.allowedHosts.has(hostname)) {
      sendJson(res, 403, { error: { code: "unauthorized", message: "Host is not allowed." } }, cors);
      return;
    }
  }

  const expected = runtime.config.httpToken;
  if (expected) {
    const presented = bearerToken(typeof req.headers.authorization === "string" ? req.headers.authorization : undefined);
    if (!presented || !tokensMatch(presented, expected)) {
      sendJson(
        res,
        401,
        { error: { code: "unauthorized", message: "A bearer token is required for this MCP endpoint." } },
        { ...cors, "www-authenticate": "Bearer" },
      );
      return;
    }
  }

  const mcp = runtime.createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void mcp.close();
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    runtime.log.error("mcp http request failed", {
      message: error instanceof Error ? error.name : "Error",
    });
    sendJson(res, 500, { error: { code: "upstream", message: "MCP request failed." } }, cors);
  }
}

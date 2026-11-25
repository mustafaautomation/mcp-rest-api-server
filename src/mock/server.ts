import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createMockApp, type MockAppOptions } from "./app.js";

export interface MockServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export interface StartMockOptions extends MockAppOptions {
  host?: string;
  port?: number;
}

export function startMockApi(options: StartMockOptions = {}): Promise<MockServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8788;
  const app = createMockApp({ apiKeys: options.apiKeys });

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
      const bound = info.port;
      const advertisedHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
      resolve({
        url: `http://${advertisedHost}:${bound}`,
        port: bound,
        close: () => closeServer(server),
      });
    });
    server.once("error", reject);
  });
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    if ("closeAllConnections" in server && typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

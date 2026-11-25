import { loadConfig } from "./config.js";
import { createMockApp } from "./mock/app.js";
import { SANDBOX_API_KEY } from "./mock/constants.js";
import { createRuntime, type Runtime } from "./runtime.js";

let sandbox: ReturnType<typeof createMockApp> | undefined;

/**
 * Read-only MCP runtime whose upstream is the Harborline app in this process.
 * No listening port, no external account. Safe to construct inside a serverless function.
 */
export function createDemoRuntime(): Runtime {
  sandbox ??= createMockApp({ apiKeys: [SANDBOX_API_KEY] });
  const app = sandbox;
  const fetchImpl: typeof fetch = (input, init) => Promise.resolve(app.fetch(new Request(input, init)));
  const config = loadConfig({
    env: {
      API_BASE_URL: "http://harborline.local",
      API_KEY: SANDBOX_API_KEY,
      MCP_READ_ONLY: "true",
      LOG_LEVEL: "error",
      API_MAX_RETRIES: "1",
      API_RATE_LIMIT_RPS: "20",
      API_RATE_LIMIT_BURST: "40",
    },
  });
  return createRuntime(config, { fetchImpl });
}

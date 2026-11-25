import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "mcp-rest-api-server";

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export const VERSION = readPackageVersion();
export const USER_AGENT = `${SERVER_NAME}/${VERSION}`;

import { LOG_LEVELS, type LogLevel } from "../log.js";
import type { AuthStyle } from "../config.js";

export type Command = "stdio" | "http" | "mock";

export interface ParsedArgs {
  command?: Command;
  help: boolean;
  version: boolean;
  readOnly?: boolean;
  baseUrl?: string;
  apiKey?: string;
  authStyle?: AuthStyle;
  port?: number;
  host?: string;
  envFile?: string;
  logLevel?: LogLevel;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { help: false, version: false };
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    const take = (flag: string): string => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`Missing value for ${flag}.`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "-v":
      case "--version":
        parsed.version = true;
        break;
      case "--read-only":
        parsed.readOnly = true;
        break;
      case "--read-write":
        parsed.readOnly = false;
        break;
      case "--base-url":
        parsed.baseUrl = take(arg);
        break;
      case "--api-key":
        parsed.apiKey = take(arg);
        break;
      case "--auth": {
        const value = take(arg);
        if (value !== "bearer" && value !== "api-key" && value !== "both") {
          throw new Error("--auth must be bearer, api-key, or both.");
        }
        parsed.authStyle = value;
        break;
      }
      case "--port":
        parsed.port = parsePort(take(arg));
        break;
      case "--host":
        parsed.host = take(arg);
        break;
      case "--env-file":
        parsed.envFile = take(arg);
        break;
      case "--log-level": {
        const value = take(arg);
        if (!(LOG_LEVELS as readonly string[]).includes(value)) {
          throw new Error("--log-level must be debug, info, warn, error, or silent.");
        }
        parsed.logLevel = value as LogLevel;
        break;
      }
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown flag ${arg}.`);
        positionals.push(arg);
    }
  }

  if (positionals.length > 1) throw new Error(`Unexpected argument ${positionals[1]}.`);
  const command = positionals[0];
  if (command !== undefined && command !== "stdio" && command !== "http" && command !== "mock") {
    throw new Error(`Unknown command ${command}. Expected stdio, http, or mock.`);
  }
  parsed.command = command;
  return parsed;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("--port must be an integer from 0 to 65535.");
  }
  return port;
}

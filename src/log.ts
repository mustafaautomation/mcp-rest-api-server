import { scrubText, scrubValue } from "./redact.js";

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export type LogFields = Record<string, unknown>;
export type LogSink = (level: Exclude<LogLevel, "silent">, message: string, fields: LogFields) => void;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

function defaultSink(level: Exclude<LogLevel, "silent">, message: string, fields: LogFields): void {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatField(value)}`);
  const suffix = parts.length > 0 ? ` ${parts.join(" ")}` : "";
  console.error(`${new Date().toISOString()} ${level} ${message}${suffix}`);
}

function formatField(value: unknown): string {
  if (typeof value === "string") return value.includes(" ") ? JSON.stringify(value) : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function createLogger(options: {
  level: LogLevel;
  secrets?: readonly string[];
  sink?: LogSink;
}): Logger {
  const secrets = (options.secrets ?? []).filter((secret) => secret.length >= 6);
  const sink = options.sink ?? defaultSink;

  const write = (level: Exclude<LogLevel, "silent">, message: string, fields?: LogFields): void => {
    if (RANK[level] < RANK[options.level]) return;
    sink(level, scrubText(message, secrets), (scrubValue(fields ?? {}, secrets) ?? {}) as LogFields);
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}

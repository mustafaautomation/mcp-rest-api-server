import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { ApiError } from "../api/errors.js";
import { scrubText } from "../redact.js";

export function toolSuccess(data: object): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

export function toolFailure(error: unknown, secrets: readonly string[]): CallToolResult {
  const api = toApiError(error);
  const payload = api.toPublicJSON();
  payload.message = scrubText(payload.message, secrets);
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: payload }, null, 2) }],
  };
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const path = first && first.path.length > 0 ? `${first.path.join(".")}: ` : "";
    const message = first ? `${path}${first.message}` : "Input is invalid.";
    return new ApiError({ code: "validation", message, retryable: false, probablySent: false });
  }
  return new ApiError({
    code: "upstream",
    message: "The tool failed unexpectedly.",
    retryable: false,
  });
}

export async function runTool(secrets: readonly string[], fn: () => Promise<object>): Promise<CallToolResult> {
  try {
    return toolSuccess(await fn());
  } catch (error) {
    return toolFailure(error, secrets);
  }
}

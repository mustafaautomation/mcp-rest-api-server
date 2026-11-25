export const API_ERROR_CODES = [
  "unauthorized",
  "not_found",
  "validation",
  "rate_limited",
  "conflict",
  "upstream",
  "timeout",
  "network",
  "read_only",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorInit {
  code: ApiErrorCode;
  message: string;
  status?: number;
  retryable: boolean;
  retryAfterMs?: number;
  /** False when the request never left the machine (DNS failure, connection refused). */
  probablySent?: boolean;
  requestId?: string;
}

export interface PublicApiError {
  code: ApiErrorCode;
  message: string;
  status?: number;
  requestId?: string;
  retryable: boolean;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly probablySent: boolean;
  readonly requestId?: string;
  /** Set once the client decides whether this call can be retried for its HTTP method. */
  safeToRetry?: boolean;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
    this.probablySent = init.probablySent ?? true;
    this.requestId = init.requestId;
  }

  toPublicJSON(): PublicApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.status !== undefined ? { status: this.status } : {}),
      ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
      retryable: this.safeToRetry ?? this.retryable,
    };
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

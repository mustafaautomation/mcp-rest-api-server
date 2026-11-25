import { ApiError } from "./errors.js";

export interface PageMeta {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface Page<T> {
  data: T[];
  page: PageMeta;
}

const CURSOR_MAX = 512;

/**
 * Opaque cursor over a stable offset.
 * Tools forward the string. Only the API that issued it interprets it.
 */
export function encodeCursor(offset: number): string {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ApiError({
      code: "validation",
      message: "cursor offset must be a non-negative integer.",
      retryable: false,
    });
  }
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  if (cursor.length > CURSOR_MAX) {
    throw new ApiError({
      code: "validation",
      message: "cursor is too long. Pass nextCursor from the previous page.",
      status: 400,
      retryable: false,
    });
  }
  try {
    const json = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      !json ||
      typeof json !== "object" ||
      !("o" in json) ||
      typeof json.o !== "number" ||
      !Number.isInteger(json.o) ||
      json.o < 0
    ) {
      throw new Error("bad cursor");
    }
    return json.o;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      code: "validation",
      message: "cursor is not valid. Pass nextCursor from the previous page, or omit it.",
      status: 400,
      retryable: false,
    });
  }
}

export function paginate<T>(items: readonly T[], cursor: string | undefined, limit: number): Page<T> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError({
      code: "validation",
      message: "limit must be an integer from 1 to 100.",
      status: 400,
      retryable: false,
    });
  }
  const offset = decodeCursor(cursor);
  const data = items.slice(offset, offset + limit);
  const next = offset + data.length;
  const hasMore = next < items.length;
  return {
    data: [...data],
    page: {
      limit,
      hasMore,
      nextCursor: hasMore ? encodeCursor(next) : null,
    },
  };
}

/**
 * Map a cursor onto a 1-based page number for APIs that don't issue cursors.
 * Page size must stay constant across the walk.
 */
export function cursorToPage(cursor: string | undefined, pageSize: number): number {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new ApiError({
      code: "validation",
      message: "pageSize must be an integer of at least 1.",
      retryable: false,
    });
  }
  return Math.floor(decodeCursor(cursor) / pageSize) + 1;
}

/** Inverse of {@link cursorToPage}. Page 1 has no cursor. */
export function pageToCursor(page: number, pageSize: number): string | null {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
    throw new ApiError({
      code: "validation",
      message: "page and pageSize must be integers of at least 1.",
      retryable: false,
    });
  }
  if (page === 1) return null;
  return encodeCursor((page - 1) * pageSize);
}

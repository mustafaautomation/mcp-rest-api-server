import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/errors.js";
import { cursorToPage, decodeCursor, encodeCursor, pageToCursor, paginate } from "../src/api/pagination.js";

describe("pagination", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeCursor(20);
    expect(cursor).not.toContain("20");
    expect(decodeCursor(cursor)).toBe(20);
    expect(decodeCursor(undefined)).toBe(0);
  });

  it("rejects a cursor the server did not issue", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(ApiError);
    expect(() => decodeCursor("a".repeat(600))).toThrow(/too long/);
  });

  it("pages a stable list", () => {
    const items = ["a", "b", "c", "d", "e"];
    const first = paginate(items, undefined, 2);
    expect(first.data).toEqual(["a", "b"]);
    expect(first.page.hasMore).toBe(true);
    const second = paginate(items, first.page.nextCursor ?? undefined, 2);
    expect(second.data).toEqual(["c", "d"]);
    const third = paginate(items, second.page.nextCursor ?? undefined, 2);
    expect(third.data).toEqual(["e"]);
    expect(third.page.nextCursor).toBeNull();
  });

  it("maps cursors onto page numbers", () => {
    expect(cursorToPage(undefined, 20)).toBe(1);
    expect(pageToCursor(1, 20)).toBeNull();
    const cursor = pageToCursor(3, 20);
    expect(cursorToPage(cursor ?? undefined, 20)).toBe(3);
  });
});

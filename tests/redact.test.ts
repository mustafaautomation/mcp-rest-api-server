import { describe, expect, it } from "vitest";
import { createLogger } from "../src/log.js";
import { scrubText, scrubValue } from "../src/redact.js";

describe("redaction", () => {
  it("scrubs secret values and sensitive keys", () => {
    const secret = "super-secret-key-value";
    expect(scrubText(`rejected ${secret}`, [secret])).toBe("rejected [redacted]");
    expect(
      scrubValue(
        { authorization: "Bearer abc", note: `saw ${secret}`, nested: { token: "nope" } },
        [secret],
      ),
    ).toEqual({
      authorization: "[redacted]",
      note: "saw [redacted]",
      nested: { token: "[redacted]" },
    });
  });

  it("does not log the api key", () => {
    const secret = "super-secret-key-value";
    const lines: string[] = [];
    const log = createLogger({
      level: "debug",
      secrets: [secret],
      sink: (level, message, fields) => {
        lines.push(JSON.stringify({ level, message, fields }));
      },
    });
    log.info("upstream failed", { body: `key=${secret}`, authorization: `Bearer ${secret}` });
    log.debug("short tokens stay", { note: "abc" });
    const rendered = lines.join("\n");
    expect(rendered).not.toContain(secret);
    expect(rendered).toContain("[redacted]");
  });
});

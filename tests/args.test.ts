import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";

describe("cli args", () => {
  it("parses the http command and flags", () => {
    expect(
      parseArgs(["http", "--port", "9000", "--read-write", "--auth", "api-key", "--log-level", "warn"]),
    ).toMatchObject({
      command: "http",
      port: 9000,
      readOnly: false,
      authStyle: "api-key",
      logLevel: "warn",
    });
  });

  it("rejects an unknown command and a missing flag value", () => {
    expect(() => parseArgs(["serve"])).toThrow(/Unknown command/);
    expect(() => parseArgs(["--port"])).toThrow(/Missing value/);
    expect(() => parseArgs(["--port", "nope"])).toThrow(/integer/);
  });
});

import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, parseEnvFile } from "../src/config.js";

describe("config", () => {
  it("defaults to the sandbox and read-only mode", () => {
    const config = loadConfig({ env: {} });
    expect(config.readOnly).toBe(true);
    expect(config.apiBaseUrlSource).toBe("default");
    expect(config.apiKey).toBe("sandbox-demo-key");
    expect(config.authStyle).toBe("bearer");
    expect(config.httpHost).toBe("127.0.0.1");
  });

  it("requires a key when the base URL is explicit", () => {
    expect(() => loadConfig({ env: { API_BASE_URL: "https://api.example.com" } })).toThrow(ConfigError);
    const config = loadConfig({
      env: { API_BASE_URL: "https://api.example.com/", API_KEY: "real-key-value" },
    });
    expect(config.apiBaseUrl).toBe("https://api.example.com");
    expect(config.apiBaseUrlSource).toBe("env");
  });

  it("does not echo secrets when a URL is invalid", () => {
    const secret = "super-secret-key-value";
    let caught: unknown;
    try {
      loadConfig({
        env: {
          API_BASE_URL: "not a url",
          API_KEY: secret,
          MCP_HTTP_TOKEN: secret,
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as Error).message).not.toContain(secret);
    expect((caught as Error).message).toContain("API_BASE_URL");
  });

  it("rejects credentials embedded in the base URL", () => {
    expect(() =>
      loadConfig({ env: { API_BASE_URL: "https://user:pass@example.com", API_KEY: "real-key-value" } }),
    ).toThrow(/API_KEY instead/);
  });

  it("lets CLI flags override the environment", () => {
    const config = loadConfig({
      env: { MCP_READ_ONLY: "true", API_BASE_URL: "https://api.example.com", API_KEY: "env-key-value" },
      cli: { readOnly: false, baseUrl: "https://other.example.com", apiKey: "cli-key-value" },
    });
    expect(config.readOnly).toBe(false);
    expect(config.apiBaseUrl).toBe("https://other.example.com");
    expect(config.apiKey).toBe("cli-key-value");
    expect(config.apiBaseUrlSource).toBe("cli");
  });

  it("parses a dotenv file without keeping comments", () => {
    expect(parseEnvFile('# note\nAPI_KEY="quoted value"\n\nEMPTY=\nNOT VALID=1\n')).toEqual({
      API_KEY: "quoted value",
      EMPTY: "",
    });
  });
});

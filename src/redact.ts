const SECRET_KEY = /authorization|api[-_]?key|token|secret|password|bearer|credential|cookie/i;

/** Replace known secret values. Short strings are ignored so we don't blank ordinary words. */
export function scrubText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 6) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function scrubValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return scrubText(value, secrets);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, secrets));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? "[redacted]" : scrubValue(inner, secrets);
    }
    return out;
  }
  return undefined;
}

/** Drop userinfo and redact query keys that look like credentials. */
export function safeUrl(input: URL): string {
  const url = new URL(input.href);
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (SECRET_KEY.test(key)) url.searchParams.set(key, "[redacted]");
  }
  return url.toString();
}

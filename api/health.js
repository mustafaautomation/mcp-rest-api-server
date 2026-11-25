import { SERVER_NAME, VERSION } from "../dist/version.js";

export default function handler(_req, res) {
  const body = JSON.stringify({
    ok: true,
    name: SERVER_NAME,
    version: VERSION,
    readOnly: true,
    transport: "streamable-http",
    demo: true,
  });
  const bytes = new TextEncoder().encode(body);
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(bytes.length),
  });
  res.end(bytes);
}

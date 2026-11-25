import { createDemoRuntime } from "../dist/demo-runtime.js";
import { handleHttpRequest } from "../dist/http.js";

const runtime = createDemoRuntime();

export default function handler(req, res) {
  return handleHttpRequest(req, res, runtime, {
    publicBind: true,
    allowedHosts: new Set(),
    cors: "public",
    jsonOnly: true,
  });
}

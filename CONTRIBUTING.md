# Contributing

Portfolio demo, not client work. Issues and pull requests are welcome when they make the template easier to adapt to a real API.

## Setup

```bash
git clone https://github.com/mustafaautomation/mcp-rest-api-server.git
cd mcp-rest-api-server
npm install
npm test
```

Node 22 is what CI uses. Node 20 or newer matches `engines`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
node dist/cli.js --version
```

CI also builds the Docker image and curls `/health`. Run that locally when you change `Dockerfile` or the HTTP server:

```bash
docker build -t mcp-rest-api-server:ci .
docker run --rm -p 8787:8787 mcp-rest-api-server:ci
```

## What to keep true

- stdout is the MCP protocol. Logs go to stderr.
- Do not log `API_KEY`, `Authorization`, or `MCP_HTTP_TOKEN`. Add a test if you log a new field.
- Write tools stay behind `MCP_READ_ONLY`. The REST client refuses POST and PATCH in read-only mode.
- GET requests may retry. POST and PATCH retry a 408, a 429, or a connection that never left the machine. They do not retry a 500.
- The hosted demo at `/mcp` stays read-only and uses the sandbox key only.

## Pull requests

Describe the API shape you are proving, and include a test that drives the server with the official MCP client. Do not commit `.env` files or real credentials. The sandbox key `sandbox-demo-key` is public demo data and may appear in docs.

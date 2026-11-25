# How to adapt this to your API

This repo is a template. Harborline is fictional sample data so the server runs with no accounts. Replacing it with a real REST API is a file-by-file change, not a rewrite.

Portfolio demo, not client work.

## 1. Point at the API

Leave the code alone for the first run.

```bash
API_BASE_URL=https://api.example.com \
API_KEY=your-read-only-key \
API_AUTH_STYLE=bearer \
MCP_READ_ONLY=true \
node dist/cli.js
```

`API_AUTH_STYLE=api-key` sends the key in `x-api-key` (or `API_KEY_HEADER`). `both` sends the two headers. The key stays in the environment. It is never written to stdout, and log lines scrub the value.

If the base URL is unset, the CLI boots the bundled sandbox instead. Set `API_BASE_URL` before you hand this to a client.

## 2. Match the JSON

Edit `src/api/schemas.ts`. One Zod object per resource. The mock API and the REST client both parse with these schemas, so a drift shows up as `The API response did not match the expected schema.`

Keep ids as strings. Validate them before they are interpolated into a path. `RestClient` already rejects ids that are not letters, numbers, `_`, or `-`.

## 3. Map each endpoint to a method

`src/api/client.ts` is the only place that knows URLs. Add a method per call the model should make. Tools should not call `fetch` themselves.

Cursor pagination stays at the tool boundary even when the upstream API uses page numbers:

```ts
import { cursorToPage, pageToCursor } from "./api/pagination.js";

const page = cursorToPage(cursor, 20);
const body = await this.request(
  { method: "GET", path: "/v1/orders", query: { page, per_page: 20 } },
  orderPageSchema,
);
return {
  data: body.orders,
  page: {
    limit: 20,
    hasMore: body.page < body.total_pages,
    nextCursor: body.page < body.total_pages ? pageToCursor(body.page + 1, 20) : null,
  },
};
```

The page size has to stay constant while the model walks `nextCursor`. Document that in the tool description.

## 4. Register tools, then gate writes

`src/mcp/tools.ts` is the list the model sees. Descriptions should say what the call returns and how to page. Put `readOnlyHint: true` on reads.

Write tools go below `if (config.readOnly) return`. The client also refuses `POST` and `PATCH` while read-only is on, so a new tool cannot bypass the flag by calling the client directly. Leave `MCP_READ_ONLY=true` until the user has asked for writes.

Annotations are hints. Still enforce the policy in code.

## 5. Resources and prompts

- A resource is a snapshot the client can read by URI. `src/mcp/resources.ts`.
- A prompt loads live data and asks for a specific deliverable. `src/mcp/prompts.ts`.
- Replace `src/contract.ts` so `harborline://contract` describes the real API. Do not put the live API key in that document. The sandbox key in the sample contract is public demo data.

## 6. Prove it

```bash
npm test
npm run build
npx @modelcontextprotocol/inspector --cli node dist/cli.js --method tools/list
```

The integration tests start the mock API and drive this server with the official MCP client. Copy that shape for your endpoints: one happy-path page walk, one auth failure that does not echo the key, and a read-only run that does not register write tools.

## 7. Hand over the config

Copy `docs/configs/` and replace the base URL and key. Stdio is the path Claude Desktop, Claude Code, and Cursor all launch. Use Streamable HTTP when the server runs on another machine, and set `MCP_HTTP_TOKEN` before the port is reachable beyond localhost.

```bash
claude mcp add harborline \
  -e API_BASE_URL=https://api.example.com \
  -e API_KEY=YOUR_API_KEY \
  -e MCP_READ_ONLY=true \
  -- npx -y mcp-rest-api-server
```

## What not to change

- Logs go to stderr. stdout belongs to the MCP protocol.
- Retries: GET retries on 408, 429, 5xx, and network errors. POST and PATCH retry on 408, 429, and connection failures that never left the machine. They do not retry a 500.
- The rate limiter is process-wide. Tune `API_RATE_LIMIT_RPS` and `API_RATE_LIMIT_BURST` to the vendor's budget.
- Do not log `Authorization`, the API key, or `MCP_HTTP_TOKEN`. `src/redact.ts` is the scrubber. Add a test if you log a new field.

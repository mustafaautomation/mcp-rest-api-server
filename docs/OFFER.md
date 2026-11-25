# I will build a custom MCP server for your API

Portfolio demo, not client work. The packages below are the offer this template is built to deliver. Harborline, the sample API in the repo, is fictional.

Fixed price, so the cost is known before the work starts. Similar read-only MCP jobs on Upwork have been posting around $20–48/hr. These packages are that work, sold as a deliverable.

The server speaks the Model Context Protocol over stdio and Streamable HTTP. Claude Desktop, Claude Code, and Cursor can launch it. Your REST API stays the source of truth. The default is read-only.

## Fiverr gig

**Title:** I will build a custom MCP server for your REST API

**Gallery line:** Claude, Cursor, and Claude Code tools over the API you already have. Read-only by default, with auth, pagination, retries, and tests.

**What I need from you**

- Base URL and a sample of each JSON response, or a short OpenAPI / Postman collection
- A read-only API key for a sandbox or staging account
- Which client you use: Claude Desktop, Claude Code, Cursor, or a remote HTTP endpoint
- Which actions the model may take. Reads are the default. Writes are a separate, explicit choice.

I do not need your production admin password, and I do not need access to your customers' accounts.

### Basic — $180

A read-only MCP server for one REST API.

- Up to 5 read tools
- Bearer or API-key auth
- stdio transport
- Zod input validation
- README plus one client config (Claude Desktop, Claude Code, or Cursor)
- A short screen recording of the tools answering against your sandbox

Delivery: 3 days after I have the API key and sample responses.

### Standard — $420

The shape of this repository, aimed at your API.

- Up to 12 read tools
- Cursor pagination, including a page-number adapter when your API uses `page`
- Auth, timeouts, rate limit, and retries with backoff
- Secrets stay in the environment and are scrubbed from logs
- Structured errors
- Vitest tests that boot your sandbox or a recorded fixture and call the tools through the official MCP client
- Config snippets for Claude Desktop, Claude Code, and Cursor

Delivery: 5 days after I have the API key and sample responses.

### Premium — $780

Standard, plus the parts you want before the server is shared with a team.

- Read tools plus the write tools you approve, behind a read-only flag that is on by default
- Resources and at least one prompt grounded in live API data
- Streamable HTTP transport with a bearer token and localhost binding
- Dockerfile
- GitHub Actions workflow: lint, typecheck, test, build
- A handoff note: how to rotate the key, how to add a tool, how to turn writes on

Delivery: 7 days after I have the API key and sample responses.

One revision round is included in each package: wording, an extra filter on a tool you already bought, or a config fix. A new resource or a second API is a new package.

## Not included

- Building or hosting your REST API
- OAuth provider setup beyond a bearer token or API key you already issue
- ClickUp, Connecteam, Roller, or any other vendor account. If the data is available over HTTP, the server can call it. Opening the vendor account is yours.
- Ongoing on-call. A later change is a new order.

## FAQ

**Can the model create or update records?**
Only if you buy that explicitly. The server in this repo registers write tools only when read-only mode is off, and the HTTP client refuses POST and PATCH even if a tool forgets the check.

**Where does the server run?**
On your machine, via `npx` or Docker. I don't host it. Streamable HTTP is for when you want it on a small VM you control.

**What if our API uses page numbers?**
The tools still speak `cursor` and `limit`. A small adapter in the client maps those onto `page`. The model never has to know which style you use.

**What if a call fails?**
The tool returns a structured error with a code (`unauthorized`, `not_found`, `validation`, `rate_limited`, `conflict`, `timeout`, `upstream`). The API key is not part of that payload. Safe reads retry with backoff. Writes do not retry a 500.

**Do you store our key?**
No. You put it in the MCP config on your machine. The handoff does not contain the key. Use a sandbox or read-only key.

**Which stack is this?**
TypeScript, the official `@modelcontextprotocol/sdk`, Zod, and Node 20+. You get the source, not a closed binary.

## Upwork opening

> I build small MCP servers that sit in front of an existing REST API, so Claude, Cursor, or Claude Code can list and fetch your records without a custom chat backend.
>
> The usual shape is read-only: a handful of tools, your API key from the environment, cursor pagination, timeouts, retries, and a config snippet you can paste into Claude Desktop or Cursor. Writes stay off unless you explicitly want them.
>
> I would start from a published template (stdio and Streamable HTTP, Zod, tests, Docker) and replace the sample API with yours. I need a sandbox base URL, a read-only key, and one example response per resource. I don't need a production admin login.
>
> Packages, if a fixed price is easier than hourly:
>
> - Basic, $180 — up to 5 read tools, stdio, one client config
> - Standard, $420 — up to 12 tools, pagination, auth, retries, tests, Claude + Cursor configs
> - Premium, $780 — writes behind a read-only flag, resources and a prompt, Streamable HTTP, Docker, CI
>
> If you have a Postman collection or a couple of sample JSON payloads, send those with the job and I can tell you which package fits before we start.

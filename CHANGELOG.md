# Changelog

## 1.0.0

First public template.

- MCP server on `@modelcontextprotocol/sdk` 1.32.2, stdio and Streamable HTTP.
- Harborline sandbox (projects, tasks, contacts) so the server runs with no external account.
- Bearer and API-key auth, cursor pagination, Zod validation, rate limit, and retries.
- Read-only by default, with create/update tools behind the flag.
- Resources, two prompts, Vitest coverage, Dockerfile, and client config snippets.
- Static landing page and a Vercel function that serves the same read-only sandbox at `/mcp`.

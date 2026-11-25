# Rescued from Cursor

Source: mcp-rest-api-server | Cursor https://cursor.com/agents/bc-bb19af8c-dc90-54bb-bb94-049c96df8a88
Scope: All Commits
Captured: 2026-11-25T11:26:25.423Z
Files written: 70

Not in this copy: files Cursor's template created and the agent never changed (e.g. tsconfig, shadcn ui components, lockfiles, public assets) when scope is 'Last Agent Turn'; binaries.

- binary not recoverable from diff view: docs/demo.gif
- binary not recoverable from diff view: site/demo.gif
- binary not recoverable from diff view: site/og.png
- lockfile incomplete, regenerate: package-lock.json

## Repair pass (2026-11-25, Claude)

Status: GREEN locally (Node 25.6.1, npm 11.11.0).

- `package-lock.json` was a 1-byte placeholder: regenerated with `npm install`.
- `npm run lint` clean, `npm run typecheck` clean (also `tsc -p tsconfig.typecheck.json` clean),
  `npm test` 32/32 passed in 11 files (matches the Cursor thread), `npm run build` OK,
  `node dist/cli.js --version` -> 1.0.0, `npm pack --dry-run` -> 87 files (matches the thread).
- `docs/demo.gif` re-recorded for real with `vhs docs/demo.tape` (it was a 1-byte placeholder).
  Tape tweaks so it records correctly on a machine without JetBrains Mono / with slower cold
  starts: font fallback list `JetBrains Mono, Menlo, monospace`, sleeps 2.4s -> 3.5s and 7s -> 12s.
  `site/demo.gif` is a copy of it.
- `site/og.png` regenerated as a real 1200x630 headless-Chrome screenshot of `site/index.html`
  (no script in the repo for it; the original image is not recoverable).
- No source code changes were needed.

Not verified here: the Docker CI job (Docker is not installed on this machine) and GitHub
Actions (repo not on GitHub yet).

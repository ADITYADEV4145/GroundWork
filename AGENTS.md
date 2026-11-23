# Working on Groundwork

Groundwork is built in phases by parallel streams on top of the Phase 1 index. Keep to your stream's files and the extension points below so streams don't collide.

## Commands

- `npm test` runs vitest (golden fixtures, 200-sequence incremental property test, CLI, sql.js fallback).
- `npm run typecheck` / `npm run build`.
- `npm run gw -- <cmd>` runs the CLI from source; `npm run selftest -- --through <phase>` is the phase gate.
- `npm run golden` regenerates `fixtures/*/expected.json` after an intended extractor change. Review the diff.

## Extension points

| What | Where | How |
| --- | --- | --- |
| CLI command | `src/cli/commands/<name>.ts` | export `register(program)`, add it to the list in `src/cli/program.ts` (the hook bootstrap stays lightweight) |
| MCP tool | `src/mcp/tools/<name>.ts` | `defineTool({...})`, add it to `TOOLS` in `src/mcp/tools/index.ts` |
| Hook handler | `src/hooks/handlers/<name>.ts` | implement `HookHandler`, add it to `HANDLERS` in `src/hooks/handlers/index.ts` |
| Config | `src/config/sections/<phase>.ts` | each stream owns its section's zod schema |
| Phase gate | `src/selftest/checks/phase<N>.ts` | export `Check[]`, spread it into `CHECKS` in `src/selftest/checks/index.ts` |
| Language | `src/lang/<lang>.ts` | implement `LanguageAdapter`, register in `src/lang/index.ts` and `parser.ts` |

Read the index through `src/index/query.ts` (or `src/api.ts`); don't write SQL against the schema from feature code. A schema change bumps `SCHEMA_VERSION` in `src/store/schema.ts`; an extractor output change bumps `EXTRACTOR_VERSION` in `src/index/store.ts`.

## Rules

- Agent-facing output is short, ranked and token-budgeted (`fitToBudget`); every CLI command supports `--json`.
- Hooks fail open: any error or timeout means allow, exit 0, nothing on stdout.
- Runtime is local and offline. The sole consented setup exception is `gw init --embeddings`, which downloads a model to `.groundwork/models/` only on that explicit command; runtime inference is local-files-only and never downloads missing models. `gw update` is the other explicit exception: it asks the npm registry for the latest release only when the user runs it, and installs nothing unless the tarball's sha512 matches. Dev-only benchmark scripts (`scripts/calibrate-mine.ts`, `scripts/setup-real-repos.ts`, `scripts/setup-deps-bench.ts`) fetch pinned repos and packages into external caches and are not shipped with the tool.

## Releasing

Publishing `groundwork-agent` to npm is the maintainer's decision; never run `npm publish` without it. `prepublishOnly` builds and runs the tests. Check the tarball with `npm pack --dry-run`, and smoke-test it with `npm install -g --prefix /tmp/gw ./groundwork-agent-<version>.tgz` then `/tmp/gw/bin/gw init` in a scratch repo. The plugin and `.mcp.json` launch `gw` from PATH, so they work from a source install and from a global npm install alike.

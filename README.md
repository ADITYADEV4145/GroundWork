# Groundwork

Your agent spends most of its tokens finding its way around, then rewrites code you already have. Groundwork fixes both.

Groundwork is an open-source tool and agent skill that gives coding agents (Claude Code, Codex, Cursor) a live, local map of the codebase: fast navigation, a reuse-first duplicate gate, grounding checks for invented calls, and waste guards. 100% local; nothing leaves your machine.

Status: Phase 1 (codebase index) in place; navigation, Reuse First, grounding and waste guards are in progress.

## Quick start

Requires Node.js 22+.

```sh
npm install -g groundwork-agent
cd your-repo
gw init                      # writes .groundwork/ and builds the index
gw symbols parse config      # ranked symbol search
gw show ApiClient.get        # signature, docs, callers, callees
gw stats                     # what's indexed, how well imports and calls resolved
gw doctor                    # runtime, grammars, storage checks
```

Every command takes `--json`. The index lives in `.groundwork/index.db` and refreshes incrementally: only files whose content changed are re-parsed.

## What the index holds

TypeScript, JavaScript (JSX/CommonJS) and Python, parsed with tree-sitter (WASM):

- files with language, hash, size, line count and test/generated flags
- symbols (functions, methods, classes, interfaces, types, enums, constants, React components, dataclasses) with signatures, arity, docs, decorators, export status and parent
- body fingerprints (normalized tokens, 128-permutation MinHash over 4-token shingles, identifier vocabulary) for duplicate detection
- imports resolved to files (relative, tsconfig path aliases, barrels and re-exports, Python packages and relative imports)
- call sites resolved to symbols with confidence `exact`, `import-resolved` or `name-only`
- literals: URLs, paths, env vars, config keys and exported constants

Storage is `node:sqlite`, with a `sql.js` fallback.

## Development

See [AGENTS.md](AGENTS.md).

## License

MIT

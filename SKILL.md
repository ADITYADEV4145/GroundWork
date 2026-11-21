---
name: groundwork
description: Navigate a TypeScript, JavaScript, or Python repository using Groundwork's local code index. Use for coding and code review tasks that need you to find symbols, trace calls, or read only the relevant code instead of entire files.
---

# Groundwork navigation

1. Start once per repository with `repo_map()` to see the main directories. Narrow by `path` instead of fetching a deeper global map.
2. Use `find_code({ "query": "what you need" })` before grep. Search with a name, name fragment, or words from the signature or docs. Use `kind` to narrow noisy results.
3. Use `outline({ "file": "path/to/file.ts" })` before reading an unfamiliar file.
4. Read one definition with `read_symbol({ "symbol": "symbol-id" })`. If the name is ambiguous, pick the ID whose location matches the task. Ask for a few `context_lines` only if needed. Read an entire file only when its full contents matter.
5. Use `callers`, `callees`, and `where_used` to trace changes. Treat `name-only` and unresolved edges as leads, not proof. Follow the exact `Next` call when more results are useful.

## Fall back when the index cannot answer

Use ordinary search and ranged Read for docs, logs, config, unsupported languages, and raw text or syntax that is not indexed. For a missing or incomplete result, verify the relevant lines directly. If the MCP server is not connected, `gw symbols` and `gw show` can locate symbols; use normal tools when Groundwork is unavailable.

When Claude's read guard says a range is unchanged, use the earlier result or read just the relevant symbol. If you need that exact range again, repeat the same Read once to force it; don't retry reflexively.

See [navigation examples](references/navigation.md).

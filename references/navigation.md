# Navigation examples

Run `gw mcp` as a local stdio MCP server rooted in the repository (set its working directory or use `gw --root /path/to/repo mcp`). These examples use the tool names without the MCP client prefix.

### Find a definition and inspect its neighborhood

- Use `rg` for trivial literal/filename lookups; use the index for symbol, behavior and structure questions. Stop once the requested location is resolved.
- `find_code({"query":"formatDate","kind":"function"})` returns exact matches first. Use `breadth:"all"` to expand; without an exact hit, results are ranked broadly. Set `locations_only:false` to include signatures, docs and scores.
- `outline({"file":"src/utils/date.ts"})` shows symbol names and ranges without signatures or bodies. Set `locations_only:false` for signatures. Skip outline when you already know which symbol to read.
- `read_symbol({"symbol":"src/utils/date.ts:formatDate","context_lines":1})` reads the body. If multiple declarations match, pass a candidate ID instead. With zero context, only the indexed declaration is returned.
- `repo_map({"depth":1})` gives an overview when you don't know where to start. Narrow with `path` to explore a folder; maps default to 12 rows per page.

### Trace a change

- `callers({"symbol":"formatDate","limit":8})` shows indexed incoming calls and how they were resolved.
- `callees({"symbol":"ApiClient.get"})` includes outgoing calls that the index could not resolve.
- `where_used({"name":"API_URL"})` groups indexed calls, imports, and literal matches by file; it is not a full-text search.

The search and map rank the most useful results first. If output is truncated, use the returned `Next` call or narrow the query. `read_symbol` can continue partway through a long definition; retain its context setting when you follow the cursor. TypeScript overloads, dynamic dispatch, and unindexed files may need direct inspection.

### Claude Code read guard

Wire the following commands into Claude Code hooks if not already installed by your setup:

| Event | Matcher | Command |
| --- | --- | --- |
| PreToolUse | `Read` | `gw hook claude pre_tool` |
| PostToolUse | `Read\|mcp__groundwork__find_code\|mcp__plugin_groundwork_groundwork__find_code` | `gw hook claude post_tool` |
| PreCompact | any | `gw hook claude pre_compact` |

The guard records only successful, verified text ranges. It intercepts a repeated range only if the file is unchanged and the earlier read covered the entire requested range. Repeat the exact Read once to force it; normal Claude permissions still apply. Compaction clears the read history. An unranged large read is allowed with a hint; change the threshold or disable the guard via `navigation.readGuard` in the Groundwork config.

The local session ledger and intervention log record estimated content tokens (UTF-8 bytes divided by four, rounded up), not model-token measurements or net savings.

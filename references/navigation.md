# Navigation examples

Run `gw mcp` as a local stdio MCP server rooted in the repository (set its working directory or use `gw --root /path/to/repo mcp`). These examples use the tool names without the MCP client prefix.

### Find a definition and inspect its neighborhood

- Use `rg` for trivial literal/filename lookups; use the index for symbol, behavior and structure questions. Stop once the requested location is resolved.
- `find_code({"query":"formatDate","kind":"function"})` returns exact matches first. Use `breadth:"all"` to expand; without an exact hit, results are ranked broadly. Set `locations_only:false` to include signatures, docs and scores. Set `include_body:true` to get source in this same call when there is exactly one exact match; otherwise normal lookup results are returned. Defaults stay location-only.
- `outline({"file":"src/utils/date.ts"})` shows symbol names and ranges without signatures or bodies. Set `locations_only:false` for signatures. Skip outline when you already know which symbol to read.
- Outline several files in one call, at most once per orientation: `outline({"files":["src/utils/date.ts","src/main.ts"]})`. Pass either `file` or `files` (up to 20 paths / 900 JSON bytes). The batch shares one 400-token budget; follow its `offset` cursor only for missing symbols.
- `read_symbol({"symbol":"src/utils/date.ts:formatDate","context_lines":1})` reads the body. For a known helper you need to recall, use this instead of a whole-file Read; skip outline first. Batch several with `read_symbol({"symbols":["formatDate","pad"]})`; pass either `symbol` or `symbols`, not both. If multiple declarations match, pass a candidate ID instead. With zero context, only the indexed declaration is returned.
- `repo_map({"depth":1})` gives an overview when you don't know where to start. Narrow with `path` to explore a folder; maps default to 12 rows per page.

For continuing or long-horizon work, do one orientation step: batched `outline` for unfamiliar files or batched `read_symbol` for known helpers. Do not repeat a map/outline cycle per task; fetch only missing or changed evidence thereafter.

### Trace a change

For a known trace entry, use `read_symbol({"symbol":"name or ID","callee_depth":2})`: it includes the entry and exact/import-resolved outgoing definitions up to two hops in one shared 1,200-token budget. Pass a single symbol, not a batch or source offset. Use `callee_depth:1` for direct targets only. Follow its `symbol_offset` continuation for omitted definitions and individual source continuations for longer bodies, only when the requested evidence is missing. Locate an unknown entry first with targeted search; do not repeat outline/callees/read at every hop. For location-only questions, stop at a resolved definition location/ID instead of confirming it with outline or Read. Use `callers` for incoming calls and `where_used` for references. Name-only/unresolved edges require direct inspection; an indexed trace is not proof of runtime dispatch. Only with experimental read paths enabled, start with `explore` for broader context; otherwise it remains optional, not the default first step. Reuse unchanged evidence across continuing steps and sessions only when carried into your current context; another agent's reads are not your evidence.

- `callers({"symbol":"formatDate","limit":8})` shows indexed incoming calls and how they were resolved.
- `callees({"symbol":"ApiClient.get"})` includes outgoing calls that the index could not resolve.
- `where_used({"name":"API_URL"})` groups indexed calls, imports, and literal matches by file; it is not a full-text search.

The search and map rank the most useful results first. If output is truncated, use the returned `Next` call or narrow the query. `read_symbol` can continue partway through a long definition; retain its context setting when you follow the cursor. TypeScript overloads, dynamic dispatch, and unindexed files may need direct inspection.

Batches accept up to 20 selectors with at most 900 UTF-8 bytes of JSON; use IDs or fewer symbols for long selectors. They share a 1,200-token budget and use compact headers. Follow individual source continuations for truncated bodies and the batch continuation for remaining symbols, only when needed. Neither continuation means an omitted body was fully read.

Experimental read paths default off. Opt in with `navigation.experimentalReadPaths: true` in `.groundwork/config.json` or `GW_EXPERIMENTAL_READ_PATHS=1`; any other explicit env value disables them. Use root config if your launcher does not forward custom environment variables. The `explore` tool remains available without opting in.

Only with experimental read paths enabled, the Claude Read guard can replace a whole-file Read of indexed source at least 2 KiB with a compact outline and one or two likely relevant symbol bodies. It uses the recent find_code query, otherwise index-ranked symbols. This is a denied Read carrying selected evidence, not a successful full-file Read. The payload is at most 900 estimated tokens and 65% of source bytes; otherwise it allows the Read. Repeat the exact Read to get the full file. This rule leaves small files and explicitly ranged Reads untouched; the existing unchanged-repeat guard still applies. Invalid sessions, subagents, missing/empty/partial/stale indexes and errors fail open. It never refreshes or waits for an index writer. The 2 KiB threshold targets only the upper tail of observed v2/v3 navigation Read sizes; all observed LH Reads were smaller.

### Claude Code read guard

Wire the following commands into Claude Code hooks if not already installed by your setup:

| Event | Matcher | Command |
| --- | --- | --- |
| PreToolUse | `Read` | `gw hook claude pre_tool` |
| PostToolUse | `Read\|mcp__groundwork__find_code\|mcp__plugin_groundwork_groundwork__find_code` | `gw hook claude post_tool` |
| PreCompact | any | `gw hook claude pre_compact` |

The guard records only successful, verified text ranges. It intercepts a repeated range only if the file is unchanged and the earlier read covered the entire requested range. Repeat the exact Read once to force it; normal Claude permissions still apply. Compaction clears the read history. An unranged large read is allowed with a hint; change the threshold or disable the guard via `navigation.readGuard` in the Groundwork config.

The local session ledger and intervention log record estimated content tokens (UTF-8 bytes divided by four, rounded up), not model-token measurements or net savings.

### Local runtime and caches

`gw mcp` uses a small stdio relay to an automatically started, per-user local service shared across workspace roots. Its private Unix socket is in the OS temporary directory; no network listener or download is used. Runtime code, Node version and relevant environment settings identify the service version. Each connection selects and validates a canonical root; indexes, configuration, locks and session ledgers remain root-local. Every request still checks configuration and index freshness. The service exits after 30 seconds without clients. Unsupported platforms, startup/version errors and service disconnection fall back to an in-process server; a disconnected session replays only initialization and unfinished requests. Set `GW_MCP_IN_PROCESS=1` to bypass the service.

Read/edit hooks and post-find_code feedback use a slim client when a compatible service is already running; hooks never start a service. Missing services or version mismatches use the existing in-process handler. Socket/protocol failures and the short request timeout fail open without replay; Cursor still emits its required allow response. Session, subagent, range and content-hash safeguards are unchanged. Set `GW_HOOK_IN_PROCESS=1` to bypass hook forwarding. A private runtime fingerprint cache checks file and directory metadata and rehashes after changes; deleting it only makes service discovery colder.

Parsed extraction products are shared across workspace roots in `$XDG_CACHE_HOME/groundwork` (default `~/.cache/groundwork`), keyed by source hash, language and extractor version. File IDs, paths, imports and configuration-dependent exclusions are recomputed in each repository. Cache entries are private, checksummed and atomically written; unavailable/corrupt entries are ignored. Deleting this disposable cache only makes subsequent indexing colder. `GW_CACHE_DIR` and `GW_RUNTIME_DIR` override the cache and socket directories; both must be private and owned by the current user. `GW_MCP_IDLE_MS` sets the idle timeout (100–300,000 ms).

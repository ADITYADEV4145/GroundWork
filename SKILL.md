---
name: groundwork
description: Use for any coding task in a repository: to find code, read only what's needed, check for existing code before writing new code, and verify calls exist.
---

# Groundwork

Groundwork keeps a live local index of this repository (TypeScript, JavaScript, Python) and exposes it as MCP tools. Use it to spend fewer tokens finding your way around, to reuse code that already exists, and to call only functions that exist.

## 1. Navigate: index first, whole files last

1. Once per repository, run `repo_map()` to see the main directories. To go deeper, narrow by `path` rather than asking for a bigger global map.
2. Use `find_code({ "query": "what you need" })` before grep. Search with a name, a name fragment, or words from the signature or docs. Use `kind` to narrow noisy results.
3. Before reading an unfamiliar file, use `outline({ "file": "path/to/file.ts" })`.
4. Read one definition with `read_symbol({ "symbol": "symbol-id" })`. If the name is ambiguous, pick the ID whose location fits the task. Ask for a few `context_lines` only if you need them. Read a whole file only when you need all of it.
5. Trace a change with `callers`, `callees` and `where_used`. Treat `name-only` and unresolved edges as leads, not proof. When you want more results, follow the exact `Next` call.

Fall back to ordinary search and ranged reads for docs, logs, config, unsupported languages, and raw text the index does not hold. If a result is missing or incomplete, check the lines directly. If the MCP server is not connected, `gw symbols` and `gw show` find symbols from the shell.

## 2. Reuse first: look before you write

Before you write a new function, class, hook, component or constant:

1. Call `find_similar({ "description": "what it does", "name": "planned name", "signature": "planned signature" })`. Pass `code` once you have a draft.
2. State your decision in one line:
   - `REUSE <symbol>`: an existing symbol already does it. Import it and call it.
   - `EXTEND <symbol>`: it nearly does. Change it (add a parameter, generalise it) instead of adding a sibling.
   - `NEW because <reason>`: nothing fits, and the reason says why.
3. When you replace old code, delete the old version and move its callers over. Do not leave both behind.

Constants and config keys count too. Reuse the existing `API_URL`; do not define a second one.

## 3. Respond to feedback

**Grounding notes after an edit** ("these names/arguments do not match the code") list imports, calls, members or arguments in the lines you just changed that the index cannot find. Each note names the nearest real symbols with their signature and location. Fix the call to use one of them, or add the missing definition if you really meant to create it. To check a file yourself at any point, call `verify_calls({ "file": "src/x.ts", "lines": "10-40" })`.

**The Stop gate** runs `gw check` over your uncommitted changes when you finish. Findings look like this:

```
BLOCK duplicate: formatDay (src/ui/day.ts:12)
Existing: formatDate (src/utils/date.ts:4)
Why: structure=0.91, vocabulary=0.84; p=0.973
Fix: reuse formatDate or extend it; delete formatDay
```

Act on each finding by reusing or extending the existing symbol, deleting dead code left over from a change, or fixing the invented call. Then stop again. In the `standard` profile the findings are warnings. In `strict` the first stop with new findings is held back until you deal with them.

**Waste guards**:
- A repeated command with nothing changed returns the earlier result's summary instead of running again.
- A repeated read of unchanged lines points you to `outline` and `read_symbol`.
- Long outputs are trimmed, but failures are always kept.

## 4. Force, rarely and with a reason

Guards are wrong sometimes. When you have checked and the guard is wrong:
- Repeat the exact same Read once to force a guarded read.
- Rerun a command with `GW_FORCE=1 <cmd>` or `<cmd> # gw:force`.
- Mark an intended duplicate with a comment on the line above it: `// groundwork: allow-duplicate <specific reason>`. The reason must say why, in at least three meaningful words; vague reasons ("needed", "different") are rejected and reported.

Forces and allows are counted and logged. If you force often, you are fighting the tool: use the index instead.

## References

- [Navigation examples](references/navigation.md)
- [Reuse protocol and gate findings](references/reuse.md)
- [Grounding checks](references/grounding.md)
- [Troubleshooting](references/troubleshooting.md)

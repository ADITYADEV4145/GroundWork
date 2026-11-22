---
name: groundwork
description: "Use for any coding task in a repository: to find code, read only what's needed, check for existing code before writing new code, and verify calls exist."
---

# Groundwork

Groundwork keeps a live local index of this repository (TypeScript, JavaScript, Python) and exposes it as MCP tools. Use it to find and reuse existing code and verify calls.

## 1. Navigate: use the cheapest sufficient evidence

1. Use `rg` for a trivial literal or filename lookup. Use the index for symbol, behavior and structure questions: `find_code({ "query": "what you need" })`. Exact names return exact matches; use `breadth: "all"` only when broader results are needed. Set `locations_only: false` for signatures or docs. Stop when the requested location is resolved.
2. If you have a file but not a symbol, use `outline({ "file": "path/to/file.ts" })` instead of reading the whole file. If you already know the symbol and need its body, go straight to `read_symbol({ "symbol": "exact name or ID" })`; do not add an outline first. Outline defaults to locations/ranges; set `locations_only: false` for signatures.
3. Use `repo_map({ "depth": 1 })` once if you need orientation in an unfamiliar repo. Skip the map for a targeted lookup; go deeper by narrowing `path`.
4. Trace with `callers`, `callees`, or `where_used` when you know the anchor name. Treat `name-only` and unresolved edges as leads. Verify only missing details with a symbol or ranged read. Follow the exact `Next` call if you need more results.

Fall back to ordinary search and ranged reads for docs, logs, config, unsupported languages, and raw text the index does not hold. If a result is missing or incomplete, check the lines directly. If the MCP server is not connected, `gw symbols` and `gw show` find symbols from the shell.

## 2. Reuse first: look before you write

Before writing a genuinely new non-trivial helper/function (including a class, hook or component with new reusable logic), check for existing code. Skip `find_similar` for small edits, inline code, simple constants and already-confirmed helpers; reuse known symbols directly. Reuse earlier search evidence within the task while the relevant code is unchanged. Default results are actionable reuse/extend matches; request `detail: "full"` only when related matches are useful.

1. Call `find_similar({ "description": "what it does", "name": "planned name", "signature": "planned signature" })`. Pass `code` once you have a draft.
2. State your decision in one line:
   - `REUSE <symbol>`: an existing symbol already does it. Import it and call it.
   - `EXTEND <symbol>`: it nearly does. Change it (add a parameter, generalise it) instead of adding a sibling.
   - `NEW because <reason>`: nothing fits, and the reason says why.
3. When you replace old code, delete the old version and move its callers over. Do not leave both behind.

Reuse existing constants and config keys such as `API_URL`; do not define a second one.

## 3. Respond to feedback

**Grounding notes after an edit** ("these names/arguments do not match the code") list imports, calls, members or arguments in the lines you just changed that the index cannot find. Each note names the nearest real symbols with their signature and location. Fix the call to use one of them, or add the missing definition if you really meant to create it. Use `verify_calls` only for new cross-file calls to symbols not already read or confirmed in this task. Batch all remaining calls once: `verify_calls({ "files": [{ "file": "src/x.ts", "lines": "10-40" }, { "file": "src/y.ts" }] })`. Skip the explicit call if there are no such calls. Evidence is reusable only while the relevant definitions are unchanged; recheck if they change. Fix findings and recheck affected ranges if needed; automatic grounding and duplicate-gate checks remain active.

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

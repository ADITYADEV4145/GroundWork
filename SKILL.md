---
name: groundwork
description: "Use for any coding task in a repository: to find code, read only what's needed, check for existing code before writing new code, and verify calls exist."
---

# Groundwork

Groundwork keeps a live local index of this repository (TypeScript, JavaScript, Python) and exposes it as MCP tools. Use it to find and reuse existing code and verify calls.

## 1. Navigate: use the cheapest sufficient evidence

1. Use `rg` for a trivial literal or filename lookup. Use the index for symbol, behavior and structure questions: `find_code({ "query": "what you need" })`. Exact names return exact matches; use `breadth: "all"` only when broader results are needed. Set `locations_only: false` for signatures or docs. If you need the body with a unique exact-name lookup, use `include_body: true` in that same call. Defaults stay location-only. Stop when the requested location is resolved.
2. For a known helper you need to recall, use `read_symbol({ "symbol": "exact name or ID" })` instead of a whole-file Read; batch several with `read_symbol({ "symbols": ["name or ID", "another name or ID"] })`. Pass either `symbol` or `symbols`, not both. If only files are known, outline several files in one call, at most once per orientation: `outline({ "files": ["src/a.ts", "src/b.ts"] })`. Keep `file` for one file. Choose symbols and read only needed bodies, not whole files. Skip outline when the symbol is known. Outline defaults to locations/ranges; set `locations_only: false` for signatures.
3. Use `repo_map({ "depth": 1 })` once if you need orientation in an unfamiliar repo. Skip the map for a targeted lookup; go deeper by narrowing `path`.
4. For a trace with a known entry, use `read_symbol({ "symbol": "name or ID", "callee_depth": 2 })` to read the entry and resolved outgoing definitions in one budgeted call, rather than outline/callees/read at every hop. Locate an unknown entry first with targeted search. Follow returned `Next` calls only for requested definitions/source still missing; use `callers` for incoming calls and `where_used` for references. A resolved definition location/ID is enough for a location-only question: do not confirm it with outline or Read. Only with experimental read paths enabled, start with `explore` for broader context. It remains optional otherwise. Indexed edges are not proof of runtime dispatch; name-only/unresolved edges require direct inspection.

Reuse definitions, signatures and source evidence across continuing steps and sessions when that evidence is carried into your current context and the relevant code is unchanged. Do not treat another agent's reads as your own. Recheck affected evidence after changes or when it was not carried forward.

For continuing or long-horizon work, do one orientation step: batched `outline` for unfamiliar files or batched `read_symbol` for known helpers. Do not repeat a map/outline cycle per task; fetch only missing or changed evidence thereafter.

Fall back to ordinary search and ranged reads for docs, logs, config, unsupported languages, and raw text the index does not hold. If a result is missing or incomplete, check the lines directly. If the MCP server is not connected, `gw symbols` and `gw show` find symbols from the shell.

## 2. Reuse first: look before you write

Before writing a genuinely new non-trivial helper/function (including a class, hook or component with new reusable logic), check for existing code. Skip `find_similar` for small edits, inline code, simple constants and already-confirmed helpers; reuse known symbols directly. Reuse unchanged search evidence across continuing steps and sessions when it is carried into your current context; repeat only if the relevant code changed or the evidence is missing. Default results are actionable reuse/extend matches; request `detail: "full"` only when related matches are useful.

1. Call `find_similar({ "description": "what it does", "name": "planned name", "signature": "planned signature" })`. Pass `code` once you have a draft.
2. State your decision in one line:
   - `REUSE <symbol>`: an existing symbol already does it. Import it and call it.
   - `EXTEND <symbol>`: it nearly does. Change it (add a parameter, generalise it) instead of adding a sibling.
   - `NEW because <reason>`: nothing fits, and the reason says why.
3. When you replace old code, delete the old version and move its callers over. Do not leave both behind.

Reuse existing constants and config keys such as `API_URL`; do not define a second one.

## 3. Respond to feedback

**Grounding notes after an edit** ("these names/arguments do not match the code") list imports, calls, members or arguments in the lines you just changed that the index cannot find. Each note names the nearest real symbols with their signature and location. Fix the call to use one of them, or add the missing definition if you really meant to create it. Never re-read a file only to satisfy the verify rule. After edits are ready, use `verify_calls` at most once per task, only for new cross-file targets unconfirmed by unchanged evidence in your current context: one batched call instead of rereads, `verify_calls({ "files": [{ "file": "src/x.ts", "lines": "10-40" }, { "file": "src/y.ts" }] })`. Skip the explicit call if no such calls remain. Evidence can carry across continuing steps and sessions, but only when available in your current context and the relevant definitions are unchanged; recheck affected calls after changes. Read a body only when needed to understand or change behavior, using `read_symbol` (batched for several helpers). Fix findings and validate affected code with tests and automatic feedback, not another explicit verification pass; automatic grounding and duplicate-gate checks remain active.

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
- Only with experimental read paths enabled, a first whole-file Read of indexed source at least 2 KiB may return a compact outline and selected bodies instead of the file. These are ranked leads, not full-file evidence; follow missing source ranges only if needed, or repeat the exact Read to get the full file. Small files and explicitly ranged Reads are not intercepted by this large-Read rule.
- Long outputs are trimmed, but failures are always kept.

Experimental read paths default off. Opt in with `navigation.experimentalReadPaths: true` in `.groundwork/config.json` or `GW_EXPERIMENTAL_READ_PATHS=1`; `0` (or any other explicit env value) disables them. This gates large-Read compaction and explore-first guidance, not the `explore` tool, batched reads, `include_body`, hook forwarding, carried evidence or ordinary repeat protection. Root config is reliable when an MCP launcher does not forward custom environment variables.

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

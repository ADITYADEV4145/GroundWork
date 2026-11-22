# Grounding checks

Agents tend to predict plausible names instead of looking them up. Groundwork checks the lines you change against the index and reports:

- imports of names a repo module does not export
- calls to repo functions, methods or members that do not exist
- calls with the wrong number of arguments
- unknown keyword arguments (Python)

Each finding names the nearest real symbols, with signature and location, so the fix is one step.

## After every edit (PostToolUse)

```
Groundwork: 1 grounding issue(s) in the lines you just changed — these names/arguments do not match the code:
src/api/orders.ts:42 parseDateString is not exported by ./utils.js. Did you mean parseDate (src/utils.ts:8, parseDate(s: string): Date)?
```

Fix the call, or add the definition if you meant to create it. The note is context, not a block. Only the lines you changed are checked, so code that was already there does not add noise.

## On demand: `verify_calls`

Never re-read a file only to satisfy the verify rule. After edits are ready, use `verify_calls` at most once per task, only for new cross-file targets unconfirmed by unchanged evidence in your current context: one batched call instead of rereads. Batch remaining calls with `files:[{file,lines?}]`; skip the explicit call if none remain. Evidence can carry across continuing steps and sessions only when available in your current context and the relevant definitions are unchanged; recheck affected calls after changes. Another agent's reads are not your evidence. Fix findings and validate affected code with tests and automatic feedback, not another explicit verification pass. Read bodies only to understand or change behavior; use `read_symbol`, batched with `symbols:[...]` for several helpers. Automatic grounding and duplicate-gate checks remain active.

```json
verify_calls({ "file": "src/api/orders.ts", "lines": "30-60" })
```

Omit `lines` to check the whole file. The result also lists what could not be checked (dynamic calls, external packages), so a clean result is not overclaimed.

## In `gw check` and the Stop gate

Findings that are definitely wrong (for example, importing a name the target module does not export) are `BLOCK grounding` findings in `gw check`, and they block the Stop hook in the `strict` profile. Uncertain cases stay as warnings.

## What it does not check

Calls into `node_modules` or site-packages, dynamic dispatch, `getattr` and computed member names, and files the index skips (generated files, `grounding.exclude` globs). For those, read the definition with `read_symbol` or check the package's types.

## Configuration

```json
{ "grounding": { "enabled": true, "postToolHook": true, "budgetTokens": 400, "exclude": ["scripts/**"] } }
```

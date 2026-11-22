# Wave-6 patch audit and focused checks

## Input, conversion and provenance

- Input: `/home/ubuntu/work/bench-v2-wf/block-results-wave6.json`. Its SHA-256 is retained in `summary.json`; per-patch SHA-256 hashes and imports are in `sanity.json`.
- All 27 distinct baseline records match the 27 task IDs exactly. Every patch is nonempty, substantive, additions-only, has valid unified-diff hunk lengths, adds the requested production module/symbol and adds one test file. No existing modules or unrelated files are edited.
- Original patches and decisions are preserved in `../block-runs-wave6/<task>/baseline.json`. Original notes are retained with an explicitly unverified agent-test note appended. Session IDs are empty and ACUs are null because neither is supplied. Independent timing, session provenance and execution logs are unavailable; no elapsed time or ACU value is inferred.
- Production modules span 27–988 lines. The large Click modules vendor dependency closures, including console classes, compatibility streams and pager helpers. These are real copies, not placeholders; the extra support code explains the high raw finding count. Repeated copies in different destination files count separately under the existing file-qualified policy, not as independent sessions or unique original helpers.
- All 52 added Python files compile. All 2 added TypeScript files parse without errors using the repository's TypeScript adapter. All 26 complete Python production modules also load by direct source execution on Linux without importing Click or pytest. This import check does not exercise platform-specific runtime APIs.
- No Python production module imports Click, pytest or `_pytest`; the got hard negative has no imports. Standard-library imports, vendored state and local structural typing definitions remain local. The wrapper definitions were inspected against all 24 requested tweaks; each delegates to the local vendored function, with the change outside its body. Existing-target names retained for recursion refer to local aliases, not the original package.
- All 24 vendored targets match the complete pinned executable AST after ignoring leading docstrings and the renamed declaration. The strict body AST (including docstring text) matches 23/24: `block6-click-ansi-stream` changes indentation inside the docstring when lifting the Windows definition. No executable statement changes in that target. This documentation-whitespace deviation from literal body preservation is disclosed, not silently repaired.
- Patches remain unchanged. The agents' 27 submitted test suites were not rerun, and their reported results remain unverified. These checks are not acceptance or task-success evaluation. Windows APIs, interactive terminal behavior and pager subprocess behavior were not runtime-tested.

## Scoring and match verification

Command:

```sh
npm run bench:v2 -- --suite block --tasks bench/reuse-v2/block-tasks-wave6.json --runs bench/reuse-v2/block-runs-wave6
```

Result: 27/27 runs `scored`; 1 PASS, 3 WARN, 23 BLOCK, 0 UNAVAILABLE. All three hard negatives avoid BLOCK. The unblocked clone `block6-pytest-raw-code` remains WARN; it was not promoted despite being copied.

The scorer creates a detached worktree at each task's exact pin, applies the actual submitted patch, and invokes the built CLI's `init` then `check --base <pin> --json` (`scripts/bench-v2.ts`). Every reviewed BLOCK is present in that run's stored check output, with the matching source recovered at its actual added/existing file and line. The review checks the reported match rather than assuming it equals the prompt reference. All 129 symbol/constant matches have equal complete normalized ASTs, including signatures, annotations, decorators, branches and nested bodies. The normalization strips only leading docstrings and the root declaration's name. Fourteen accompanying file forks are supported by copied symbol bodies; their evidence includes complete added modules and covered existing source excerpts. `README.md` links every raw finding to its comparison, raw probability/signals and concrete reason.

The two `MAX_BYTES_WRITTEN` findings are not accepted on numeric coincidence alone: each module also copies `_WindowsConsoleWriter.write`, which consumes that exact console-write cap before calling `WriteConsoleW`. Static source duplication does not require every Windows-only runtime path to execute on the Linux review host.

## Focused hard-negative and boundary checks

These checks execute the actual added modules, independently of the agents' test claims. The Click and pytest reference functions are extracted from the exact pin, compiled with postponed annotations and supplied only the minimal globals required by the tested branches. The got reference was source-inspected, not runtime-executed. No claim is made that the 143 individual symbols were all runtime-exercised.

Python command: `python /home/ubuntu/work/bench-v2-wf/check_wave6_behavior.py`. Printed output:

```text
Click hard negative: known/empty/unknown/non-string cases pass; actual pinned reference returns a class and warns, and raises AttributeError for unknown strings.
pytest hard negative: normal/empty/OSError/TypeError/RuntimeError cases pass; actual pinned reference suppresses RuntimeError whereas added code propagates it.
WARN-only clone: raw-code callable branch reaches local getrawcode alias and errors on None; WARN remains WARN.
```

- Click schema lookup returns the requested dictionaries for `BaseCommand` and `MultiCommand`, returns None for empty and unknown strings, emits no warning, and raises TypeError for a non-string. The actual reference `__getattr__` returns a class and emits DeprecationWarning for a known alias and raises AttributeError for the empty string. This disproves a duplicate-behavior interpretation of the hard negative.
- pytest source-status returns the expected availability/count mapping for nonempty and empty mocked source, handles OSError and TypeError as unavailable, and propagates RuntimeError. The actual reference `findsource` suppresses the same RuntimeError into `(None, -1)`. The differing result shape and exception contract are genuine, not just a rename.
- The WARN-only raw-code clone successfully resolves a callable instance through its local recursive alias; the wrapper returns `__call__`, and None raises TypeError. This checks a potential missing-alias defect without changing the detector verdict.

The got module was transpiled using the repository's installed TypeScript compiler and executed as CommonJS. Assertions cover named/anonymous hooks in source order, missing and empty hook lists, non-array lists and non-callable elements; a hook-call counter remains zero and a before/after options snapshot is unchanged. Printed output:

```text
got hard negative: normal/absent/empty/non-array/non-callable cases pass; no hook invocation or options mutation. Reference dispatch inspected at exact pin; not runtime-executed.
```

At `got@383a3ff4ff88d4059519efe8b3d6b27e9a6a8066:source/core/options.ts:962-969`, the reference `init` loops through hooks and invokes `hook(withOptions, self)` with a void result. The inventory's array return and no-invocation behavior are intentionally different.

## Coverage and review policy

All 143 new raw findings are agree, attributed to `Devin lead review (agent, not Aditya)`. All 16 prior raw rows and verdicts remain unchanged, including the earlier wrong-symbol disagreement and the resolved generator-grounding disagreement. Agent review remains accepted per Aditya's decision; thresholds and detector/gate code are unchanged. Covered file rows and nested/method rows are excluded using the existing exact-file-pair and dotted-ancestry rules. No WARN is promoted and no historical disagreement is softened. Full raw, distinct and independent counts are in `summary.json` and the regenerated `../block-review.md`.

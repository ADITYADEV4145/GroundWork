# Wave-5 patch sanity and provenance

Wave 5 is copy-inviting by design. Its 30 clone-prone tasks and 3 behaviorally different hard negatives are not a sample of natural duplicate incidence.

Input: `/home/ubuntu/work/bench-v2-wf/block-results-wave5.json`. The input SHA-256 is recorded in `summary.json`; per-patch hashes, files, requested symbols, imports, sizes and unverified agent test claims are in `sanity.json`.

## Checks performed

- Exactly 33 unique task IDs matching the wave-5 task file, all baseline arms, all distinct nonempty patches.
- Each patch adds exactly its requested production module and one test file; no unrelated existing-file edits. All new-file unified hunk lengths match their actual additions.
- All 33 requested symbols have substantive implementations, not placeholders. Production modules span 4–86 lines. Source inspection checked the requested concrete tweak and original-symbol import/call/subclass prohibitions. Python overload declarations were distinguished from their concrete implementation.
- All 52 added Python files compile; all 14 added TypeScript files parse without syntax errors with the current language adapter. This is syntax checking, not TypeScript typechecking against each pinned project's dependencies.
- All 33 patches apply and score with the current fixed detector build. Acceptance and task success remain null, not inferred from successful application or scoring.
- Every raw BLOCK was compared to the actual matched symbol at the exact repository pin. The single BLOCK matches an additional helper `_split_opt`, not the task's reference `_normalize_opt`. Complete AST equality and focused normal/empty/error and actual-caller checks are recorded in `B1-block5-click-lower-option-name.md`.
- All 15 historical review rows, including the resolved grounding disagreement, are preserved unchanged. No WARN was promoted. No new file/nested coverage exclusions apply; the existing exclusions remain unchanged.

## Oddities and limitations

- Two got modules, `boundary-stream.ts` and `local-socket-url.ts`, expose the requested function only as a default export, not a named export. Their added tests use default imports. The prompts say “exporting” without explicitly prescribing named exports; downstream callers expecting named imports would need to account for this. No patch was altered to normalize this choice.
- The input lacks independent session IDs, execution timings, logs and ACUs. Converted session IDs are empty strings and ACUs null, consistent with earlier waves. The input does not establish how long or how independently the implementations were produced.
- Agent-reported tests were retained verbatim as explicitly unverified notes. The 33 added test files and claims of passing project suites are not independent evidence of task success. We did not execute all submitted test suites or hidden acceptance checks.
- Zero hard-negative tasks BLOCK; this alone does not establish that their requested behavior is correct.

## Counts

| Repository | Applied/scored | PASS | WARN | BLOCK | UNAVAILABLE |
| --- | ---: | ---: | ---: | ---: | ---: |
| got | 7/7 | 1 | 6 | 0 | 0 |
| Click | 13/13 | 5 | 7 | 1 | 0 |
| pytest | 13/13 | 4 | 9 | 0 | 0 |
| Total | 33/33 | 10 | 22 | 1 | 0 |

One raw BLOCK, one distinct file-qualified symbol pair and one independent pair: **agree**, reviewer `Devin lead review (agent, not Aditya)`. Reviewer identity is recorded, not independently authenticated. Cumulative independent agreement is 8/9 (88.9%), below both gate thresholds of at least 10 pairs and at least 90% agreement.

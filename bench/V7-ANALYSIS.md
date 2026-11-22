# V7 tool-side breakdown and workflow deviations

Collector/grader: 01b142647e338ce557ef85bb7ef6c15e0c4f9257; product: main at e0cad99. Fixed stable-v1 protocol, 16 sessions/arm/suite, all 64 retained. Raw captures and pinned graded reports are under nav/v7 and long-horizon/v7. Primary estimates and whole-session intervals are in the README and benchmarks page.

Capture metadata says agent “Devin normal” and model null in both suites; these are defaults, not independently verified provider/model identities. Workflow modes were declared navigation normal / LH fusion. There is no provider-billing trace.

## Tool-side totals

B = baseline; GW = GroundWork. These are aggregate calls, emitted UTF-8 bytes and dispatch milliseconds across 16 sessions per arm, not per-session means. Shell includes captured cat/sed reads and edits. Invalid read_symbols calls are retained. Milliseconds include hook/transport/daemon costs within dispatch, but exclude CLI startup before dispatch and final output delivery. Subcomponent attribution is unavailable; these are not provider-billed tokens or model times.

| Suite | Tool | B calls | B bytes | B tool ms | GW calls | GW bytes | GW tool ms | GW time share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| nav | shell | 503 | 227893 | 25421.45 | 264 | 75035 | 16863.94 | 9.8% |
| nav | read | 466 | 306244 | 176.38 | 167 | 73799 | 18864.46 | 10.9% |
| nav | find_code | 0 | 0 | 0.00 | 256 | 224750 | 111072.81 | 64.4% |
| nav | callers | 0 | 0 | 0.00 | 27 | 7827 | 2733.95 | 1.6% |
| nav | read_symbol | 0 | 0 | 0.00 | 139 | 113447 | 13095.20 | 7.6% |
| nav | outline | 0 | 0 | 0.00 | 94 | 61204 | 8716.24 | 5.1% |
| nav | callees | 0 | 0 | 0.00 | 6 | 2079 | 563.01 | 0.3% |
| nav | repo_map | 0 | 0 | 0.00 | 5 | 287 | 485.24 | 0.3% |
| nav | read_symbols | 0 | 0 | 0.00 | 2 | 200 | 0.37 | 0.0% |
| nav | **TOTAL** | 969 | 534137 | 25597.83 | 960 | 558628 | 172395.22 | 100.0% |
| long-horizon | shell | 204 | 65854 | 8348.15 | 218 | 60447 | 7384.42 | 36.8% |
| long-horizon | read | 77 | 27203 | 27.23 | 0 | 0 | 0.00 | 0.0% |
| long-horizon | repo_map | 0 | 0 | 0.00 | 7 | 672 | 4309.25 | 21.5% |
| long-horizon | outline | 0 | 0 | 0.00 | 20 | 10361 | 4896.90 | 24.4% |
| long-horizon | read_symbol | 0 | 0 | 0.00 | 24 | 38170 | 2393.20 | 11.9% |
| long-horizon | find_similar | 0 | 0 | 0.00 | 7 | 84 | 1065.27 | 5.3% |
| long-horizon | **TOTAL** | 281 | 93057 | 8375.38 | 276 | 109734 | 20049.04 | 100.0% |

find_code accounts for most navigation GW instrumented time; in LH the largest GW spans are shell, outline and repo_map. These measured partitions do not identify which hook, index or relay component caused the cost, nor explain elapsed time outside dispatch. Fewer calls alone do not establish a performance win. Intervals condition on observed session mixtures, not unmeasured provider-wave or new-project variance.

## Deviation review

Workflow wfr-6b3ccd6a90fc44d9a6eddc085ab9c37e. All 64 notes reviewed; all 10 notes mentioning failed/error reproduced below. Additional notes describe tty-swallowed output/repeated orientation, external scratch files and staged commands, captured shell reads rather than Read, AGENTS-seeded names and prior-task evidence rechecked with tools, shared helpers without similarity checks, similarity checking after writing (LH GW16), confirmation-based verification skips, sequential chaining and uneven smoke tests. No observations excluded or corrected. Post-init retries contribute to the controller envelope, but their uncaptured output does not contribute bytes/tool spans. Harness inspection to repair env occurred in LH GW2/7, not acceptance-file inspection.

- **v7-nav-groundwork-2**: All 30 tasks finished in the required order (groundwork, ts-app, py-app, edits) under GW_BENCH_PROTOCOL=stable-v1 with GW_EXPERIMENTAL_READ_PATHS unset. Minor deviations: ts-07 used `cat src/utils/index.ts` (a 3-line file) through the shell wrapper instead of the read wrapper; in edit-04 a mistyped MCP tool name (`read_symbols`, output discarded) may appear as one failed call. No commits, PRs or harness changes.

- **v7-lh-groundwork-2**: All 10 tasks finished in order. Deviations: (1) after init, the first begin failed with 'Capture state does not match this suite' because the exec shell did not keep the exported env vars; to diagnose it I read the harness bench/capture.mjs (lines 1-20 and 105-125) and ran env checks outside the wrappers, then ran every later invocation through a small script that re-exports GW_BENCH_SUITE=long-horizon and GW_BENCH_PROTOCOL=stable-v1 and unsets GW_EXPERIMENTAL_READ_PATHS. Init itself ran with both vars set (metadata confirms suite long-horizon, protocol stable-v1). (2) No verify_calls or find_similar calls: all helpers were confirmed by one batched read_symbol and were unchanged. No task-file reads before init; no validation/acceptance files opened.

- **v7-nav-groundwork-3**: All 30 tasks finished in the stated order (groundwork, ts-app, py-app, edits). Minor deviations: (1) gw-07 used one shell `cat src/hooks/handlers/index.ts` (whole small file via shell, not the read wrapper); (2) edit-03 had one invalid captured mcp call (`read_symbols` typo, errored, no data); (3) edit-02/edit-04/edit-06 ran brief python sanity checks via the shell wrapper; (4) gw-05 query used the name fitToBudget, which was known from the repo AGENTS.md rules auto-injected into context. GW_EXPERIMENTAL_READ_PATHS unset, GW_BENCH_PROTOCOL=stable-v1 for all invocations.

- **v7-lh-groundwork-3**: All 10 tasks finished in order. Deviations: the first begin lh-01 call was chained with a failed shell-alias line (no captured tool ran), then begin was re-issued once; files were written through the shell wrapper by piping base64-encoded content from a local scratch dir (~/lhsrc) to avoid quoting problems; find_similar and verify_calls were never called (the helpers needed were already confirmed by an up-front outline + read_symbol).

- **v7-lh-groundwork-4**: All 10 tasks finished in order. Deviations: one shell command failed with MODULE_NOT_FOUND because cwd was reset outside the worktree, and one wrapper call failed on a missing state dir argument; both were fixed with a wrapper script. Read hooks never fired because I used outline/read_symbol and no file Reads. verify_calls and find_similar were not used, since all helpers came from read_symbol evidence. In lh-08, agenda.js was refactored to export sortEventsChronologically, with buildAgenda behavior unchanged.

- **v7-nav-groundwork-6**: All 30 tasks finished in required order under stable-v1, GW_EXPERIMENTAL_READ_PATHS unset. Minor deviations: an early shell invocation failed before begin (wrong cwd, no capture recorded); ts-07 used `cat src/utils/index.ts` via the shell wrapper (3-line barrel file) instead of the read wrapper.

- **v7-lh-groundwork-7**: All 10 tasks finished and exported. Deviations: (1) env exports in the persistent shell did not carry over between tool calls, so the first `begin lh-01` ran without GW_BENCH_SUITE and failed with 'Capture state does not match this suite' (no state changed). After that every wrapper call went through a script that sets GW_BENCH_SUITE=long-horizon and GW_BENCH_PROTOCOL=stable-v1 and unsets GW_EXPERIMENTAL_READ_PATHS. (2) I read bench/capture.mjs lines 100-125 (harness, not task data) to diagnose that error. (3) In lh-01 I did a batched read_symbol of all 9 lib helpers right after the single outline. No validation or acceptance files were opened.

- **v7-nav-groundwork-10**: All 30 tasks finished in the required order under stable-v1, condition groundwork, run 10, with GW_EXPERIMENTAL_READ_PATHS unset. Minor deviations: (1) the first begin call failed with a wrong cwd before any capture was recorded, then all wrapper calls went through a helper script (~/c.sh) that sets the env and cwd; (2) a few edit tasks were checked with python3 inside the wrapper shell, and __pycache__ was removed afterwards; (3) the untracked .groundwork/ index dir in the py-app workspace was left in place. No commits, PRs or external posts.

- **v7-lh-groundwork-11**: All 10 tasks finished in order via wrappers. Minor deviations: one repo_map and two outline calls in lh-01 (first outline included a non-indexed dir, so re-outlined the 6 lib files); no find_similar or verify_calls used (all helpers were existing/confirmed via read_symbol). Two initial wrapper invocations failed with module-not-found/usage errors because shell state didn't persist (no task effect); thereafter used a wrapper script setting GW_BENCH_SUITE/GW_BENCH_PROTOCOL and unsetting GW_EXPERIMENTAL_READ_PATHS. lh-08 refactored agenda.js to share a chronological sort helper.

- **v7-lh-groundwork-16**: All 10 tasks finished in order. Deviations: (1) the first begin/shell call for lh-01 failed with a usage error before doing anything, because S wasn't set in that non-persistent shell; I re-exported the env and reran. (2) In lh-03 I called find_similar for the new sortChronologically helper after writing it, not before (no matches). verify_calls was never called: all cross-file targets were confirmed by read_symbol in lh-01 or are files I wrote myself. Files were written with inline heredocs through the shell wrapper.

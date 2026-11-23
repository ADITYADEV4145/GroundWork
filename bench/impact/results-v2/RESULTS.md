# Change-impact gate results v2

**Deterministic tool-level evaluation, NOT an agent run. The actual agent gate is pending and was NOT run.**

Manifest SHA256: `f9e3c01a16728d368515be6ae600efb453dd66c94ffb75eeee2036e5679bdd85`. Checker commit: `593bfe8f181380db8a4912f72a0a26c9b6ad5cdb`.

## Summary: FAIL

| Metric | Result | Threshold | Rule |
| --- | --- | --- | --- |
| Must-change caller-file recall | 36/38 (94.74%) | >=90% | PASS |
| High-risk task precision | 12/16 (75.00%) | >=90% | FAIL |
| Affected-test-file recall | 32/32 (100.00%) | >=90% | PASS |
| Complete-flag accuracy | 6/6 (100.00%) | 100%, nonempty | PASS |
| GroundWork impact p95 | 617.324 ms | <=1500 ms | PASS |

All-task p50/p95: 34.517/617.324 ms. Complete execution coverage: true.

| Task | Caller files found/expected | Tests found/expected | High risk | complete | ms | Errors |
| --- | ---: | ---: | --- | --- | ---: | --- |
| customer-desk/required-param | 0/0 | 0/0 | true | true | 40.668 |  |
| customer-desk/rename | 0/0 | 0/0 | true | false | 36.959 |  |
| customer-desk/delete | 0/0 | 0/0 | true | false | 34.374 |  |
| customer-desk/return-shape | 0/0 | 0/0 | true | true | 30.995 |  |
| parcel-ops/required-param | 1/1 | 0/0 | true | true | 37.581 |  |
| parcel-ops/rename | 1/1 | 0/0 | true | false | 31.795 |  |
| parcel-ops/delete | 1/1 | 0/0 | true | false | 30.696 |  |
| parcel-ops/return-shape | 1/1 | 0/0 | true | true | 31.993 |  |
| dispatch-desk/required-param | 1/1 | 0/0 | true | true | 33.8 |  |
| dispatch-desk/rename | 1/1 | 0/0 | true | false | 31.764 |  |
| dispatch-desk/delete | 1/1 | 0/0 | true | false | 34.75 |  |
| dispatch-desk/return-shape | 1/1 | 0/0 | true | true | 34.517 |  |
| groundwork/required-param | 7/7 | 8/8 | true | false | 276.881 |  |
| groundwork/rename | 7/8 | 8/8 | true | false | 592.325 |  |
| groundwork/delete | 7/8 | 8/8 | true | false | 617.324 |  |
| groundwork/return-shape | 7/7 | 8/8 | true | false | 274.612 |  |

## Missing caller/test files and completeness reasons

- **customer-desk/required-param**: missing callers: none; missing tests: none. Incomplete because: none.
- **customer-desk/rename**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **customer-desk/delete**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **customer-desk/return-shape**: missing callers: none; missing tests: none. Incomplete because: none.
- **parcel-ops/required-param**: missing callers: none; missing tests: none. Incomplete because: none.
- **parcel-ops/rename**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/delete**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/return-shape**: missing callers: none; missing tests: none. Incomplete because: none.
- **dispatch-desk/required-param**: missing callers: none; missing tests: none. Incomplete because: none.
- **dispatch-desk/rename**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **dispatch-desk/delete**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **dispatch-desk/return-shape**: missing callers: none; missing tests: none. Incomplete because: none.
- **groundwork/required-param**: missing callers: none; missing tests: none. Incomplete because: caller depth truncated: src/util/tokens.ts:fitToBudget; import depth truncated: src/util/tokens.ts; dynamic references: test/embeddings.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist.
- **groundwork/rename**: missing callers: src/api.ts; missing tests: none. Incomplete because: import depth truncated: src/util/tokens.ts; caller depth truncated: src/util/tokens.ts:fitToBudget; dynamic references: test/embeddings.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist.
- **groundwork/delete**: missing callers: src/api.ts; missing tests: none. Incomplete because: caller depth truncated: src/util/tokens.ts:fitToBudget; import depth truncated: src/util/tokens.ts; dynamic references: test/embeddings.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist.
- **groundwork/return-shape**: missing callers: none; missing tests: none. Incomplete because: caller depth truncated: src/util/tokens.ts:fitToBudget; import depth truncated: src/util/tokens.ts; dynamic references: test/embeddings.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist.

## Limitations and deviations

- The four high-risk predictions without new external compiler error files are the customer-desk tasks. Each report lists the real import-resolved/name-only caller in `test/services.test.mjs:8`; that file imports getUserById and calls it. The inherited runner filters oracle workspace files to TS/TSX for TS repositories and Python for dispatch-desk, and the TS config does not enable checkJs. Consequently the compiler oracle has no external error files for those tasks. Under the frozen task-level scoring rule all four count against precision; this is not evidence that the index invented those callers. No oracle/checker change or rerun was made after this observation.
- The same oracle-file filter excludes tracked `.mjs` tests from affected-test ground truth. Thus 32/32 only covers the eight GroundWork test files across four tasks, not all tests indexed by the feature. The small repositories do have tracked JavaScript tests; the v1 report's statement that they had no tracked tests was incorrect. V1 artifacts are left untouched as requested; this clarification does not rescore either experiment.
- The two missed compiler-error caller-file predictions are the src/api.ts re-export site for GroundWork rename/delete. The six complete answers are required-param/return-shape tasks in the three small repositories; no GroundWork answer claimed complete.
- No post-registration checker fixes after observing results. No tasks removed, no selective reruns or threshold changes.
- Compiler error files are a must-change proxy, not proof of semantic exhaustiveness. High-risk precision is task-level, not per-symbol calibration. Test oracle uses only static imports within depth two plus compiler errors.
- complete describes indexed static evidence in one snapshot, not arbitrary dynamic runtime reachability. Zero complete answers is undefined accuracy and fails the registered rule, not a vacuous pass.
- Timing excludes refresh, oracle and process startup. Stop uses a hard time-boxed worker; this benchmark does not measure total hook dispatch or establish agent behavior.
- The source anchor predates impact implementation. GroundWork oracle rows may include API/compiler skew against current development dependencies; raw baseline and post-edit diagnostics are retained.
- Environment: {"node":"v24.22.2","typescript":"5.9.3","pyright":"pyright 1.1.414"}.
- Raw findings, false-positive caller listings, baseline/new diagnostics and timings are in results.json. Agent gate remains pending in ../AGENT-PROTOCOL.md.

V2 preregistered the involved-file/matching-name completeness scope correction and source-worker cwd fix before evaluation; it uses new targets. V1 remains unchanged as FAIL in ../results/. No post-v2-result checker tuning or reruns.

Completeness is checked against the scoped static/compiler oracle, not arbitrary dynamic reachability. High-risk task precision on signature mutations does not establish precision on negative/no-impact changes.

# Change-impact gate results v3

**Deterministic tool-level evaluation, NOT an agent run. The actual agent gate is pending and was NOT run.**

Manifest SHA256: `404b462fbd5d17f3080ba78194ed7269492f0c950f7f943a3ff1c15cf79e0084`. Checker commit: `386539ebc8714791c7cf73e7ecb9951a9b66ef7c`. Runner commit: `9401766972b6376f151fd4e7daadff45d99b480e`.

## Summary: PASS

| Metric | Result | Threshold | Rule |
| --- | --- | --- | --- |
| Must-change caller-file recall | 8/8 (100.00%) | >=90% | PASS |
| High-risk task precision | 8/8 (100.00%) | >=90% | PASS |
| Affected-test-file recall | 72/72 (100.00%) | >=90% | PASS |
| Complete-flag accuracy | 10/10 (100.00%) | 100%, nonempty | PASS |
| GroundWork impact p95 | 675.449 ms | <=1500 ms | PASS |

All-task p50/p95: 47.379/675.449 ms. Complete execution coverage: true.

| Task | Caller files found/expected | Tests found/expected | High risk | complete | ms | Errors |
| --- | ---: | ---: | --- | --- | ---: | --- |
| customer-desk/required-param | 0/0 | 0/0 | false | true | 51.029 |  |
| customer-desk/rename | 0/0 | 0/0 | false | true | 47.927 |  |
| customer-desk/delete | 0/0 | 0/0 | false | true | 45.117 |  |
| customer-desk/return-shape | 0/0 | 0/0 | false | true | 45.203 |  |
| parcel-ops/required-param | 1/1 | 0/0 | true | true | 40.514 |  |
| parcel-ops/rename | 1/1 | 0/0 | true | false | 48.299 |  |
| parcel-ops/delete | 1/1 | 0/0 | true | false | 47.379 |  |
| parcel-ops/return-shape | 1/1 | 0/0 | true | true | 39.932 |  |
| dispatch-desk/required-param | 0/0 | 0/0 | false | true | 40.858 |  |
| dispatch-desk/rename | 0/0 | 0/0 | false | true | 39.245 |  |
| dispatch-desk/delete | 0/0 | 0/0 | false | true | 41.896 |  |
| dispatch-desk/return-shape | 0/0 | 0/0 | false | true | 50.848 |  |
| groundwork/required-param | 1/1 | 18/18 | true | false | 675.449 |  |
| groundwork/rename | 1/1 | 18/18 | true | false | 489.682 |  |
| groundwork/delete | 1/1 | 18/18 | true | false | 491.872 |  |
| groundwork/return-shape | 1/1 | 18/18 | true | false | 474.314 |  |

## Missing caller/test files and completeness reasons

- **customer-desk/required-param**: missing callers: none; missing tests: none. Incomplete because: none.
- **customer-desk/rename**: missing callers: none; missing tests: none. Incomplete because: none.
- **customer-desk/delete**: missing callers: none; missing tests: none. Incomplete because: none.
- **customer-desk/return-shape**: missing callers: none; missing tests: none. Incomplete because: none.
- **parcel-ops/required-param**: missing callers: none; missing tests: none. Incomplete because: none.
- **parcel-ops/rename**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/delete**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/return-shape**: missing callers: none; missing tests: none. Incomplete because: none.
- **dispatch-desk/required-param**: missing callers: none; missing tests: none. Incomplete because: none.
- **dispatch-desk/rename**: missing callers: none; missing tests: none. Incomplete because: none.
- **dispatch-desk/delete**: missing callers: none; missing tests: none. Incomplete because: none.
- **dispatch-desk/return-shape**: missing callers: none; missing tests: none. Incomplete because: none.
- **groundwork/required-param**: missing callers: none; missing tests: none. Incomplete because: caller depth truncated: src/util/hash.ts:fnv1a; import depth truncated: src/util/hash.ts; unparsed file: src/index/query.ts; dynamic references: test/embeddings.test.ts; dynamic references: test/impact.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved local imports exist.
- **groundwork/rename**: missing callers: none; missing tests: none. Incomplete because: import depth truncated: src/util/hash.ts; caller depth truncated: src/util/hash.ts:fnv1a; unparsed file: src/index/query.ts; dynamic references: test/embeddings.test.ts; dynamic references: test/impact.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist.
- **groundwork/delete**: missing callers: none; missing tests: none. Incomplete because: caller depth truncated: src/util/hash.ts:fnv1a; import depth truncated: src/util/hash.ts; unparsed file: src/index/query.ts; dynamic references: test/embeddings.test.ts; dynamic references: test/impact.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist.
- **groundwork/return-shape**: missing callers: none; missing tests: none. Incomplete because: caller depth truncated: src/util/hash.ts:fnv1a; import depth truncated: src/util/hash.ts; unparsed file: src/index/query.ts; dynamic references: test/embeddings.test.ts; dynamic references: test/impact.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved local imports exist.

## Limitations and deviations

- No checker fixes entered this frozen run after preregistration. No tasks removed, no selective reruns or threshold changes. Subsequent session-evidence-only fixes (findings 8–10) were separately authorized after the run; the v3 checker was not re-frozen or rerun.
- Compiler error files are a must-change proxy, not proof of semantic exhaustiveness. High-risk precision is task-level, not per-symbol calibration. Test oracle uses only static imports within depth two plus compiler errors.
- complete describes indexed static evidence in one snapshot, not arbitrary dynamic runtime reachability. Zero complete answers is undefined accuracy and fails the registered rule, not a vacuous pass.
- Timing excludes refresh, oracle and process startup. Stop uses a hard time-boxed worker; this benchmark does not measure total hook dispatch or establish agent behavior.
- The source anchor is the fixed post-finding-7 checker 386539e, not a pre-implementation snapshot. Raw baseline and post-edit diagnostics are retained; current installed development dependencies are reused, not reconstructed historical installs.
- Environment: {"node":"v24.22.2","typescript":"5.9.3","pyright":"pyright 1.1.414"}.
- Raw findings, false-positive caller listings, baseline/new diagnostics and timings are in results.json. Agent gate remains pending in ../AGENT-PROTOCOL.md.

V3 uses the separately registered new seed/targets and includes tracked .js/.mjs/.cjs in the TS and static-test oracles, with allowJs/checkJs/noEmit. No new runtime/checker policy is based on these results. V1/v2 remain published FAIL, not rescored.

The fixed checker is 386539e (all seven reviewed fixes). No sessionId is passed by the benchmark. Any subsequent session-evidence-only fixes are outside this run and cannot affect its caller/risk/test/completeness metrics.

The v2 evidence established three JS oracle gaps and one genuine false high-risk return-shape rating; this experiment does not erase that counterexample. Precision is task-level and compiler-based, not universal risk calibration.

## Coverage and subsequent evidence fixes

Eight of sixteen tasks (customer-desk and dispatch-desk) have zero oracle caller
and test files and do not contribute to the micro-recall denominators or the
high-risk precision denominator. Eight of ten complete answers are those
zero-oracle-caller/test tasks. All 72 affected-test pairs are the same eighteen
GroundWork files across its four mutations. The mechanical new-target selection
was not changed after observing this limited coverage. Passing these registered
rules does not establish negative-case calibration or the pending agent gate.

After this single run, separately requested findings 8–10 changed only
src/impact/evidence.ts: constrain discovery-root options, decline file coverage
for name filters, and apply only whole-path exclusions. The benchmark calls
changeImpact without sessionId. sessionEvidence loads no session commands in that
case, and its ran callback never enters selector parsing. Those changes cannot
affect this run's caller, risk, test, completeness or timing observations. The
frozen checker remains 386539e; no v3 re-freeze or rerun was performed. This section
and the corrected source-anchor description are report-only editorial additions;
results.json is the original single-run output.

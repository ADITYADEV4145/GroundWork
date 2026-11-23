# Change-impact gate results

**Deterministic tool-level evaluation, NOT an agent run. The actual agent gate is pending and was NOT run.**

Manifest SHA256: `7a591c90d5fdcfc9fb6e12d1f0349789f213c239ceda234fcc30e284770cf67e`. Checker commit: `e7dc8a43a5601ac2e69b6bccd33742189b9c2bab`.

## Summary: FAIL

| Metric | Result | Threshold | Rule |
| --- | --- | --- | --- |
| Must-change caller-file recall | 53/55 (96.36%) | >=90% | PASS |
| High-risk task precision | 16/16 (100.00%) | >=90% | PASS |
| Affected-test-file recall | 32/32 (100.00%) | >=90% | PASS |
| Complete-flag accuracy | 0/0 (undefined) | 100%, nonempty | FAIL |
| GroundWork impact p95 | 628.338 ms | <=1500 ms | PASS |

All-task p50/p95: 31.433/628.338 ms. Complete execution coverage: true.

| Task | Caller files found/expected | Tests found/expected | High risk | complete | ms | Errors |
| --- | ---: | ---: | --- | --- | ---: | --- |
| customer-desk/required-param | 1/1 | 0/0 | true | false | 45.64 |  |
| customer-desk/rename | 1/1 | 0/0 | true | false | 32.087 |  |
| customer-desk/delete | 1/1 | 0/0 | true | false | 31.433 |  |
| customer-desk/return-shape | 1/1 | 0/0 | true | false | 32.687 |  |
| parcel-ops/required-param | 1/1 | 0/0 | true | false | 30.788 |  |
| parcel-ops/rename | 1/1 | 0/0 | true | false | 30.615 |  |
| parcel-ops/delete | 1/1 | 0/0 | true | false | 31.133 |  |
| parcel-ops/return-shape | 1/1 | 0/0 | true | false | 31.038 |  |
| dispatch-desk/required-param | 1/1 | 0/0 | true | false | 42.452 |  |
| dispatch-desk/rename | 1/1 | 0/0 | true | false | 31.17 |  |
| dispatch-desk/delete | 1/1 | 0/0 | true | false | 30.969 |  |
| dispatch-desk/return-shape | 1/1 | 0/0 | true | false | 30.92 |  |
| groundwork/required-param | 11/11 | 8/8 | true | false | 316.974 |  |
| groundwork/rename | 11/12 | 8/8 | true | false | 628.338 |  |
| groundwork/delete | 11/12 | 8/8 | true | false | 573.574 |  |
| groundwork/return-shape | 8/8 | 8/8 | true | false | 292.52 |  |

## Missing caller/test files and completeness reasons

- **customer-desk/required-param**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **customer-desk/rename**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **customer-desk/delete**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **customer-desk/return-shape**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/required-param**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/rename**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/delete**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **parcel-ops/return-shape**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **dispatch-desk/required-param**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **dispatch-desk/rename**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **dispatch-desk/delete**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **dispatch-desk/return-shape**: missing callers: none; missing tests: none. Incomplete because: unresolved or name-only calls exist.
- **groundwork/required-param**: missing callers: none; missing tests: none. Incomplete because: dynamic references: bench/dupes/corpus/unique-values/oss/old.js; dynamic references: fixtures/grounding-py/app/models.py; dynamic references: fixtures/grounding-py/app/monkey.py; dynamic references: fixtures/grounding-ts/src/bad3.ts; dynamic references: fixtures/grounding-ts/src/good-dynamic.ts; dynamic references: fixtures/grounding-ts/src/good-review.ts; dynamic references: fixtures/grounding-ts/src/good-template.ts; dynamic references: fixtures/grounding-ts/src/lib/configured.ts; unparsed file: fixtures/reuse-app/generated.ts; dynamic references: scripts/real-history-dev.ts; dynamic references: src/grounding/verify.ts; unparsed file: src/index/query.ts; unparsed file: test/bench-replay.test.ts; dynamic references: test/embeddings.test.ts; unparsed file: test/grounding-acceptance.test.ts; dynamic references: test/grounding-acceptance.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist; caller depth truncated: src/util/tokens.ts:estimateTokens; import depth truncated: src/util/tokens.ts.
- **groundwork/rename**: missing callers: src/api.ts; missing tests: none. Incomplete because: dynamic references: bench/dupes/corpus/unique-values/oss/old.js; dynamic references: fixtures/grounding-py/app/models.py; dynamic references: fixtures/grounding-py/app/monkey.py; dynamic references: fixtures/grounding-ts/src/bad3.ts; dynamic references: fixtures/grounding-ts/src/good-dynamic.ts; dynamic references: fixtures/grounding-ts/src/good-review.ts; dynamic references: fixtures/grounding-ts/src/good-template.ts; dynamic references: fixtures/grounding-ts/src/lib/configured.ts; unparsed file: fixtures/reuse-app/generated.ts; dynamic references: scripts/real-history-dev.ts; dynamic references: src/grounding/verify.ts; unparsed file: src/index/query.ts; unparsed file: test/bench-replay.test.ts; dynamic references: test/embeddings.test.ts; unparsed file: test/grounding-acceptance.test.ts; dynamic references: test/grounding-acceptance.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist; import depth truncated: src/util/tokens.ts; caller depth truncated: src/util/tokens.ts:estimateTokens.
- **groundwork/delete**: missing callers: src/api.ts; missing tests: none. Incomplete because: dynamic references: bench/dupes/corpus/unique-values/oss/old.js; dynamic references: fixtures/grounding-py/app/models.py; dynamic references: fixtures/grounding-py/app/monkey.py; dynamic references: fixtures/grounding-ts/src/bad3.ts; dynamic references: fixtures/grounding-ts/src/good-dynamic.ts; dynamic references: fixtures/grounding-ts/src/good-review.ts; dynamic references: fixtures/grounding-ts/src/good-template.ts; dynamic references: fixtures/grounding-ts/src/lib/configured.ts; unparsed file: fixtures/reuse-app/generated.ts; dynamic references: scripts/real-history-dev.ts; dynamic references: src/grounding/verify.ts; unparsed file: src/index/query.ts; unparsed file: test/bench-replay.test.ts; dynamic references: test/embeddings.test.ts; unparsed file: test/grounding-acceptance.test.ts; dynamic references: test/grounding-acceptance.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist; caller depth truncated: src/util/tokens.ts:estimateTokens; import depth truncated: src/util/tokens.ts.
- **groundwork/return-shape**: missing callers: none; missing tests: none. Incomplete because: dynamic references: bench/dupes/corpus/unique-values/oss/old.js; dynamic references: fixtures/grounding-py/app/models.py; dynamic references: fixtures/grounding-py/app/monkey.py; dynamic references: fixtures/grounding-ts/src/bad3.ts; dynamic references: fixtures/grounding-ts/src/good-dynamic.ts; dynamic references: fixtures/grounding-ts/src/good-review.ts; dynamic references: fixtures/grounding-ts/src/good-template.ts; dynamic references: fixtures/grounding-ts/src/lib/configured.ts; unparsed file: fixtures/reuse-app/generated.ts; dynamic references: scripts/real-history-dev.ts; dynamic references: src/grounding/verify.ts; unparsed file: src/index/query.ts; unparsed file: test/bench-replay.test.ts; dynamic references: test/embeddings.test.ts; unparsed file: test/grounding-acceptance.test.ts; dynamic references: test/grounding-acceptance.test.ts; dynamic references: test/reuse-contracts.test.ts; dynamic references: test/types.test.ts; unresolved or name-only calls exist; unresolved local imports exist; caller depth truncated: src/util/tokens.ts:estimateTokens; import depth truncated: src/util/tokens.ts.

## Limitations and deviations

- No post-registration checker fixes after observing results. No tasks removed, no selective reruns or threshold changes.
- Compiler error files are a must-change proxy, not proof of semantic exhaustiveness. High-risk precision is task-level, not per-symbol calibration. Test oracle uses only static imports within depth two plus compiler errors.
- Every frozen task had compiler-error caller files, so the 16/16 high-risk result does not establish precision on negative/no-impact changes. The three small benchmark repositories had no tracked tests; all 32 expected task/test-file pairs come from GroundWork (eight files across four mutations).
- The two missing caller-file predictions are the src/api.ts re-export site in GroundWork rename/delete tasks. The unresolved/name-only-call check kept complete:false on every small-repository task; GroundWork additionally had dynamic, unparsed, unresolved-import and depth-truncation reasons. No complete:true answer was evaluated on this corpus; the simple fixture's unit test does not substitute for that benchmark rule.
- complete describes indexed static evidence in one snapshot, not arbitrary dynamic runtime reachability. Zero complete answers is undefined accuracy and fails the registered rule, not a vacuous pass.
- Timing excludes refresh, oracle and process startup. Stop uses a hard time-boxed worker; this benchmark does not measure total hook dispatch or establish agent behavior.
- The source anchor predates impact implementation. GroundWork oracle rows may include API/compiler skew against current development dependencies; raw baseline and post-edit diagnostics are retained.
- Environment: {"node":"v24.22.2","typescript":"5.9.3","pyright":"pyright 1.1.414"}.
- Raw findings, false-positive caller listings, baseline/new diagnostics and timings are in results.json. Agent gate remains pending in ../AGENT-PROTOCOL.md.

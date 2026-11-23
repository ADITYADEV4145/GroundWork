# Change-impact deterministic gate — preregistration

**Deterministic tool-level evaluation, NOT an agent run.** The plan's actual
agent gate (more planted callers updated, success not lower) is pending; see
AGENT-PROTOCOL.md. No agent-success, speed, token or cost claim follows here.
This protocol and frozen task manifest are committed before implementation,
runner execution or impact results. Publish PASS, FAIL or INCOMPLETE either way.

## Frozen tasks

- Anchor: `0f911fd26cfc066e5d3150ec336352723b043ca7`.
- Manifest: `bench/impact/tasks.json`.
- Manifest SHA256: `7a591c90d5fdcfc9fb6e12d1f0349789f213c239ceda234fcc30e284770cf67e`.
- Generator: `node bench/impact/generate.mjs` at that anchor; syntax only, no
  diagnostics or impact calls during generation.
- Sixteen tasks: required-param, rename, delete, return-shape for each of
  customer-desk/getUserByEmail, parcel-ops/listOrders, dispatch-desk/list_orders,
  and GroundWork/estimateTokens. Targets and exact before/after text are frozen.
  Use grounding reference workflow replacements for the three bench repositories;
  all other source/config comes from the anchor. GroundWork uses its src/ and tests.
- Toolchain: Node v24.22.2, project-resolved TypeScript 5.9.3, Pyright 1.1.414.
  Provision existing development dependencies via target node_modules symlinks.
  No evaluation downloads or historical dependency reinstalls.

## Ground truth and arms

Run every task independently from the same committed baseline. Require exactly
one frozen before-text match; do not drop tasks based on detection. Refresh the
index after the edit and call the same changeImpact API used by gw impact, with
base HEAD and depth 2. Keep raw symbols, caller confidence, tests, completeness
reasons, timings, availability and errors. Compare both compiler baseline and
mutated diagnostics with a generous 30-second oracle budget, not hook budgets.

Ground truth must-change caller **files** are files outside the edited target
with NEW compiler error diagnostics after the change (TS syntactic+semantic or
Pyright errors), normalized by file/code/whitespace-normalized message ignoring
line. Score file-level recall because rename/delete often diagnose imports rather
than the eventual call line. Report the exact diagnostics; compiler errors may
overapproximate runtime must-change callers and cannot certify all dynamic uses.
Only tracked source/tests in the target workspace are in the oracle scope;
external node_modules and .groundwork are not. Keep pre-existing diagnostics but
do not count them as new ground truth. No allowlist or dynamic suppression in
the compiler oracle. A task with zero new external error files remains in raw
results but contributes zero to the micro-recall denominator.

Affected-test ground truth is test files among the compiler error files, plus
tests statically importing the edited file, directly or through one intermediate
module (depth 2). Build this independent oracle using TypeScript syntax import
declarations / Python relative from-import syntax and filesystem resolution, not
the feature's query helpers or reported graph. Test path rule: test/tests/
__tests__ directory, *.test.*, *.spec.*, test_*.py or *_test.py. Reference repos'
workflow tests are included when they import the target within this scope.

- Caller recall: micro total must-change caller files listed / ground-truth files.
  Listings may be conservative; report false positives as well.
- High-risk precision: task-level high-risk predictions are correct iff at least
  one must-change external caller file is in the compiler ground truth. Report
  numerator/denominator, with zero predictions scored 0 (no vacuous pass).
- Affected-test recall: micro listed ground-truth tests / all ground-truth tests;
  report numerator/denominator and zero-denominator as undefined, not perfect.
- Complete-flag accuracy: among answers claiming complete=true, fraction missing
  neither ground-truth caller files nor tests. Must be 100%; zero complete
  answers is undefined and cannot pass this rule. This checks completeness against
  this oracle, not universal semantic exhaustiveness.
- Runtime: time changeImpact itself, including base extraction and freshness
  checks, excluding index refresh and oracle computation. Report all per-task
  times and nearest-rank p50/p95 overall and GroundWork-only (four tasks), with no
  warm-up removal/retries. Timing scopes do not imply total Stop hook latency.

## Pass thresholds and publication

With complete execution of all sixteen tasks and both compilers available:
caller recall >= 0.90; high-risk precision >= 0.90; affected-test recall >= 0.90;
complete-flag accuracy = 1 with at least one complete answer; and GroundWork p95
<= 1500 ms. All five must pass. Undefined metrics fail their rule. Missing arms,
timeouts or unavailable compilers make the overall result INCOMPLETE, never PASS.
Otherwise overall FAIL if any rule fails. Publish results regardless in
bench/impact/results/results.json and RESULTS.md with each rule and raw rows.

The runner must reject a manifest SHA mismatch before creating workspaces or
evaluating tasks and verify anchor reachability. No tuning after results. A
genuine post-registration bug fix must be disclosed, retain earlier results,
and rerun the full set. Runtime hook timeouts fail open and never block; impact
context is evidence only in every profile. The deterministic gate cannot claim
the pending agent gate passed.

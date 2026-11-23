# Change-impact deterministic gate v3 — preregistration

**Deterministic tool-level evaluation, NOT an agent run.** The actual planted-caller
agent gate remains pending. Publish the single run whether PASS, FAIL or INCOMPLETE.
V1 and v2 remain published as FAIL, with their original verdicts/artifacts untouched.

## Reason, fixed checker, and oracle change

The v2 evidence in results-v2/ORACLE-EVIDENCE.md supports **three** omitted-JS
caller errors, not four. Return-shape is a genuine false high-risk rating under
the registered external must-change caller criterion: its JS test still passes.
The maintainer explicitly authorized v3 despite that counterexample. No risk rule
is changed to reclassify it, and v3 must not be described as a corrected v2 pass.

V3 mechanically broadens only the TS oracle workspace file list to **all tracked
files ending in .ts, .tsx, .js, .mjs or .cjs**, with no fixture/example exclusions.
Use those same root files for TypeScript createProgram with project tsconfig
options plus allowJs:true, checkJs:true, noEmit:true. Include those JS files in the
existing independent static-import test oracle too. .jsx/.mts/.cts and untracked
files remain outside this registered oracle. Python remains tracked .py plus the
same Pyright invocation. No downloads, new dependency installs or checker changes.
Node declaration/possible-null and other pre-existing compiler errors stay in raw
baseline diagnostics and are excluded from NEW errors by the original comparison.

Fixed checker **and source anchor**: `386539ebc8714791c7cf73e7ecb9951a9b66ef7c`.
Before evaluation, require src/ to be byte-identical to this commit. Runner changes
are limited to version selection, JS oracle scope/options, and result provenance.
The checker includes all seven review fixes, each preceded by a failing test:

1. 6b7d45e: compare base/current declaration text for deletion-only body changes.
2. b3c0eaf: retain aliased default-import callers of deleted exports.
3. 437de91: track changed export aliases and their old imported bindings.
4. d1ebe70: safely decode the output-trimmer wrapper for test-run evidence.
5. b5a2bda: honor package test-script positional selectors.
6. 86367b4: derive method visibility from current/base syntax trees.
7. 386539e: separate runner option flags/values and exclusions from selectors.

These fixes predate this preregistration; none is based on v3 results. No further
checker edits, task filtering, threshold changes, retries or reruns after results.

## Frozen tasks and new seed

- Manifest: `bench/impact/tasks-v3.json`.
- Manifest SHA256: `404b462fbd5d17f3080ba78194ed7269492f0c950f7f943a3ff1c15cf79e0084`.
- Seed: `impact-v3-2026-11-22-js-oracle`.
- Generator: `node bench/impact/generate-v3.mjs 386539ebc8714791c7cf73e7ecb9951a9b66ef7c`.
- Generation is syntax-only, before any v3 compiler/impact evaluation. Commit this
  protocol, generator and manifest separately before implementing/running v3.
- For each small repository, enumerate tracked .ts under src/ or .py under dispatch/
  at the anchor, excluding workflows (the reference workflows are overlaid later).
  For GroundWork use tracked .ts under src/util/. Exclude .d.ts. TS candidates are
  exported named top-level function declarations with bodies and explicit non-void,
  non-never returns. Python candidates are column-zero public def declarations
  with one-line signatures and explicit non-None returns. Exclude all names used
  by v1/v2 in that repository. Do not inspect callers/tests/diagnostics to select.
- Rank candidates by ascending SHA256(seed + NUL + repo + NUL + file + NUL + name).
  Choose the first in each repository; retain candidate counts and hashes in the
  manifest. Frozen targets: customer-desk/src/mail.ts:renderReminder (8 candidates),
  parcel-ops/src/labels.ts:formatDispatch (8),
  dispatch-desk/dispatch/contacts.py:get_billing_email (8),
  GroundWork/src/util/hash.ts:fnv1a (11). None is a v1/v2 target.
- Same four mutation kinds, four per target, sixteen total: prepend a required
  number/int parameter; rename to name + RenamedV3; delete the full declaration;
  replace declared return type (TS string becomes number, every other TS return
  becomes string; Python str becomes int, every other Python return becomes str).
  Exact before/after bytes are frozen. Do not drop zero-caller/test tasks.
- Apply the same reference workflow replacements as v1/v2. Use Node v24.22.2,
  TypeScript 5.9.3, Pyright 1.1.414, current local development node_modules symlinks,
  depth 2 and impact timeout 1500 ms. No oracle feedback during selection.

## Unchanged scoring, thresholds, and publication

For every independent task: verify one before-text match, refresh the index, call
changeImpact with base HEAD, and retain raw baseline/post-edit compiler diagnostics,
graphs, confidence, tests, complete/incomplete reasons and timings. Compiler oracle
budget is 30 seconds. Ground-truth caller files are NEW error files outside the
edited target, normalized by file/code/whitespace-normalized message ignoring line.
No allowlist/dynamic suppression. A task with zero new external error files stays
in raw results and contributes zero to the micro-recall denominator.

Affected tests are compiler-error test files plus static imports of the edited
file within depth two, using the existing independent syntax/filesystem oracle,
not feature queries. Same test-path rules and ESM import/export / Python from-import
resolution as v1/v2; no new CommonJS require or dynamic-import traversal is added.
Compiler error files and this static graph are proxies, not semantic exhaustiveness.

All five rules must pass with complete execution and available compilers:

| Metric | Threshold |
| --- | --- |
| Micro must-change caller-file recall | >= 0.90 |
| Task-level high-risk precision (correct iff compiler oracle has an external error file) | >= 0.90 |
| Micro affected-test-file recall | >= 0.90 |
| Complete-flag accuracy (no ground-truth caller/test omitted for complete:true) | 1.00, at least one complete answer |
| GroundWork impact API nearest-rank p95 | <= 1500 ms |

Undefined metrics fail their rule. Missing execution/compilers/timeouts make the
overall result INCOMPLETE; otherwise any failed rule is FAIL. No negative/no-impact
calibration claim follows from signature mutations or high-risk task precision.
Time changeImpact including base extraction/freshness, excluding refresh, oracle
and process startup; retain every timing, no warm-up removal or retries. This does
not establish total Stop latency or agent behavior.

Verify manifest hash before creating workspaces and anchor reachability. Run
`npm run bench:impact -- --v3` exactly once. Publish results-v3/results.json and
RESULTS.md regardless of outcome, including per-task misses and all rules. Record
the fixed checker commit separately from the runner commit. Do not overwrite or
rescore v1/v2. No tuning and no reruns after the single v3 evaluation.

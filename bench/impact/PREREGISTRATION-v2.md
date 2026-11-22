# Change-impact deterministic gate v2 — preregistration

**Deterministic tool-level evaluation, NOT an agent run.** The actual planted-caller
agent gate remains pending in AGENT-PROTOCOL.md. Publish PASS, FAIL or INCOMPLETE.
V1 remains published unchanged as FAIL in results/. This is a separate protocol,
not a replacement verdict or a reclassification of v1 results.

## Reason and checker change declared before evaluation

V1 used repository-global completeness checks and produced zero complete answers.
The requested scope was the involved impact, not unrelated repository ambiguity.
V2 checks freshness/parsing/dynamic signals in changed files and reached caller,
test and import-intermediary files. Unresolved local imports count in those files.
Unresolved/name-only calls anywhere count only if the terminal name matches a
selected symbol or a traversed caller name. All other guards (base extraction,
deletion uncertainty, declaration ambiguity, depth truncation, timeout) remain.
The source-mode Stop worker also gets the package-root cwd for tsx resolution;
that setup correction does not change the measured API or oracle. V1 is not rerun.

This preregistration, generator and frozen manifest are committed separately
before any v2 diagnostics/impact evaluation or results exist. Target selection is
syntax-only; no compiler/impact feedback is used. No tuning after the single run.

## Frozen corpus and mechanical selection

- Anchor: `4507e279fa853f6676b15f590808f088be949eae` (rewritten type-branch head).
- Manifest: `bench/impact/tasks-v2.json`.
- Manifest SHA256: `f9e3c01a16728d368515be6ae600efb453dd66c94ffb75eeee2036e5679bdd85`.
- Generator: `node bench/impact/generate-v2.mjs 4507e279fa853f6676b15f590808f088be949eae`.
- Same four repositories and target files as v1. For each, list public top-level
  Python def names / exported typed TypeScript function declarations with bodies
  in that file, excluding the v1 target. Choose the first name lexicographically
  after the v1 name, wrapping to the lexicographically first remaining name.
  No filtering by callers, tests, compiler outcome or completeness is permitted.
- New targets: customer-desk/getUserById, parcel-ops/getOrderByReference,
  dispatch-desk/get_order, GroundWork/fitToBudget. None is a v1 target.
- Four fixed mutations per symbol, sixteen tasks: prepend a required number/int
  parameter (before optional/default parameters); rename to name + RenamedV2;
  delete the full declaration; replace the declared return type with
  `{ id: number } | null` for the two small TS repos, `int` for Python, and
  `string` for GroundWork. Exact before/after bytes are frozen in the manifest.
- Apply the same grounding reference workflow replacements as v1 in the three
  small repos. Use tracked source/tests and current development node_modules
  symlinks; no downloads or reconstructed historical dependencies.
- Node v24.22.2, TypeScript 5.9.3, Pyright 1.1.414, depth 2, impact timeout 1500 ms.

## Oracle, metrics and rules (unchanged from v1)

Run every task independently from the committed baseline, exactly one before-text
match. Refresh the index and call changeImpact with base HEAD. Ground-truth caller
files are NEW compiler error files outside the edited file, normalized by
file/code/whitespace-normalized message, ignoring line. Retain baseline/post-edit
diagnostics without allowlist or dynamic suppression; oracle budget 30 seconds.
GroundWork oracle uses tracked TS/TSX files; dispatch-desk uses Python. Compiler
errors are a must-change proxy, not a guarantee of semantic exhaustiveness.

Affected tests are compiler-error test files plus static importers of the edited
file within depth two, using the independent TypeScript syntax / Python from-import
and filesystem oracle from v1, not feature queries. Same test-path patterns as v1.
Zero-ground-truth tasks stay in results and contribute zero to micro denominators.
Retain raw graphs, missing/extra caller files, completeness reasons and errors.

All five rules must pass with all sixteen tasks and compilers available:

| Metric | Threshold |
| --- | --- |
| Micro must-change caller-file recall | >= 0.90 |
| Task-level high-risk precision (correct iff compiler ground truth has an external caller file) | >= 0.90 |
| Micro affected-test-file recall | >= 0.90 |
| Complete-flag accuracy (no ground-truth caller/test omitted when complete:true) | 1.00, at least one complete answer |
| GroundWork impact API nearest-rank p95 | <= 1500 ms |

Undefined denominators fail their rule, never a vacuous pass. Unavailable compilers,
timeouts or missing execution coverage make overall INCOMPLETE; otherwise any
failed rule makes overall FAIL. Time changeImpact including base/freshness work,
excluding index refresh, oracle and startup; retain all timings without warm-up
removal/retries. Report overall and GroundWork-only timings as in v1. No total
Stop-latency or agent-success claim follows. High-risk task precision is not
per-symbol calibration, and these signature-mutation tasks are not negative controls.

Refuse mismatching manifest hashes before workspace creation; verify anchor
reachability. Run `npm run bench:impact -- --v2` once, then publish results-v2/
results.json and RESULTS.md regardless of outcome. Leave results/ intact. A genuine
post-registration bug fix must be disclosed, preserve the earlier run, and rerun
the full set rather than selective cases. No threshold/task tuning after results.

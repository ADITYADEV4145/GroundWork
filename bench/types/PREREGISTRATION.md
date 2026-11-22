# Type-aware checking: preregistered tool-level gate

This is a **deterministic tool-level evaluation, not an agent run**. No agent task
success, token, cost, or speed-improvement claim follows from it. This document,
the generator, and the frozen list are committed before either arm is evaluated.
Results will be published whether the gate passes, fails, or is incomplete.

## Frozen inputs

- Source/history anchor: `afaf7e48a522c101f73f671d19a0651a7c1d5940`.
- Manifest: `bench/types/mutations.json`.
- Manifest SHA256: `278f41bc48e4ce996f960cef49b60567814a7c47569d439e5191be72009dbdc0`.
- Generator: `node bench/types/generate.mjs afaf7e48a522c101f73f671d19a0651a7c1d5940`.
- Seed: `17021991`. Generation uses syntax/declared annotations only; it never
  invokes grounding, type diagnostics, tests, or either evaluation arm.
- Compiler provisioning: TypeScript `5.9.3`, Pyright `1.1.414`; Node `v24.22.2`.
  Workspaces resolve TypeScript through their own `node_modules` symlink to the
  installed development toolchain, not a checker-bundled compiler. No installs or
  downloads occur during evaluation. Record actual versions and mismatches.

The corpus is `bench/grounding/repos/{customer-desk,parcel-ops,dispatch-desk}`
(two TypeScript projects and one Python project), plus GroundWork's own `src/`.
Each grounding repository uses its corresponding complete workflow reference
from `bench/grounding/reference/` as the mutation baseline. These are literal
replacement files, not patches; require the original workflow target to exist.
All other files come from the anchor. The manifest freezes source hashes,
before/after lines, filenames, line numbers, operators, IDs, and clean commits.

## Mutations

94 independent single-line mutations: 22 customer-desk, 24 parcel-ops,
24 dispatch-desk, 24 GroundWork. Never combine mutations. Reset to the same
baseline before each one; verify the frozen before-line and all source hashes.
These changes remove a required argument, substitute an incompatible argument,
invent an export/property, or invoke a non-callable value: actual API bugs, not
new synthetic example functions added to the projects.

For each repository/operator, enumerate eligible syntax sites, deduplicate exact
mutations, rank by SHA256 of `seed + ':' + JSON.stringify(candidate)`, and take
the first four (all if fewer). The generator is the authoritative enumeration.

| Operator | Transformation |
| --- | --- |
| unknown-export | Replace a relative import's named export with a nonexistent name, preserving the local alias. Covers module-level names already checked by grounding. |
| arity | Remove arguments from calls to a known function with required parameters. |
| return-member | Invent a property/method on a variable initialized from a return value. |
| argument-type | Replace an argument with an incompatible primitive (including an array replaced by a number). |
| annotated-property | Invent a property on an interface-annotated TypeScript parameter or class-annotated Python parameter. |
| non-callable | Call an existing string/number/boolean property as a function. |

TS candidates use the TypeScript syntax tree, relative imports and declared
function/interface signatures, without a semantic program. Python candidates
use fixed patterns in `dispatch/` (exclude definitions and tests), the known
typed service functions, returned `order` values, and annotated model members.
No candidates may be removed or replaced based on detection results.

## Arms and scoring

- **A:** current syntax/import grounding alone (`verifyChanged`), on an index
  refreshed after the edit. No reuse/duplicate findings.
- **B:** the union of A's blocking findings and the optional `typeCheck` layer's
  blocking findings, with the same edit ranges/base. Identical grounding in both
  arms; deduplicate identical same-line/name findings, preferring grounding.
- Use current default checking policy and `types.timeoutMs = 4000`. No code,
  allowlist, thresholds, config exclusions, or selection changes after results.
  The separately requested Stop fix (only BLOCK findings surface at Stop) is
  planned before evaluation and does not change either arm's blocking policy.
- A seeded error is caught iff at least one blocking finding falls on its single
  edited line. Count each mutation at most once per arm. Keep raw findings,
  availability, errors, timeouts and elapsed times for every row; report totals
  and per-operator counts for both arms.
- A timeout or unavailable compiler is not a clean negative. Preserve the row
  and any A results, label incomplete coverage, and never declare the gate passed
  with missing evaluations. Do not silently omit rows or rerun only failures.

## Clean set (false-block proxy)

Per the approved widened history rule: the last 40 non-merge commits reachable
from the anchor that touch **any tracked `*.ts`** file, including `src/`, `test/`,
`scripts/`, and `bench/`. Query:

```sh
git log -40 --no-merges --format='%H %P' afaf7e48a522c101f73f671d19a0651a7c1d5940 -- '*.ts'
```

Only **32** qualifying commits exist; take all 32, frozen with their actual
parents in the manifest. No unmerged/all-ref history and no synthetic padding.
For each commit, materialize that actual commit's complete tree; compare against
its own parent. Check only added/changed lines of tracked `*.ts` files (deleted
files/lines have no current lines to check). Use the current checker, not the
historical checker. Provision the same installed development dependencies into
each isolated target workspace; record that this is not historical lockfile
reinstallation. Compiler/API skew can affect this proxy and must not be hidden.

Also evaluate all three grounding reference solutions, each applied to its
original repo baseline, checking only changed workflow lines. Application errors
are listed, not silently excluded. These real commits/reference solutions are
designated clean proxies, not independently proved bug-free ground truth.

False blocks are the **number of blocking findings** in each arm across the clean
set, not merely the number of affected commits. Union/dedupe by file, line and
normalized terminal name (strip a call suffix and receiver); within an arm retain
distinct code/message findings. List every blocking finding with its clean case,
file/line, name, message, provenance, and whether newly introduced by B. Include
per-case totals and total clean-case counts.

## Stop type-check timing

Measure only the type-check component used by Stop, not full Stop dispatch,
indexing, agent latency, or a PostToolUse hook. Use GroundWork at the frozen
anchor with `src/util/tokens.ts`'s `TOKEN_ESTIMATE_METHOD` line changed from single
to double quotes; this is one real edited line with unchanged behavior. Use the
actual changed line and base, and the default 4000 ms type timeout.

40 sequential measured calls: 20 cold calls, each in a fresh harness process
(timer starts immediately before `typeCheck`, so worker/compiler startup counts,
but harness process launch does not), followed by 20 warm calls in one process
reusing the worker/LanguageService. One explicitly recorded warm-up call precedes
the 20 warm measurements; it is not in the percentile denominator. No retries,
outlier removal or tuning. Report individual samples, warm-up, cold/warm and
combined p50/p95 using nearest rank (`ceil(p*n)-1`). Timeouts remain in the data
and make coverage incomplete even if the timer races under 4000 ms.

## Decision and publication

With complete coverage, the gate passes only if **all** are true:

1. B catches **strictly more** seeded errors than A.
2. B clean-set false blocks are **less than or equal to** A's.
3. Combined p95 Stop type-check time is **<= 4000 ms**.

Otherwise publish FAIL (or INCOMPLETE when an arm could not be evaluated), each
individual rule, all raw rows, and limitations in
`bench/types/results/results.json` and `bench/types/results/RESULTS.md`.
This gate cannot justify enabling type checking after every edit: the default
remains Stop-only (`types.postToolHook: false`); this experiment does not measure
the tighter PostToolUse path. If Stop's type budget fails, report it rather than
raising the budget or enabling another hook path.

The runner must reject a manifest/hash mismatch before creating workspaces or
running either arm. A genuine checker defect found afterwards requires a
separate documented post-registration fix and a full rerun, with previous
results retained as an archived run; never tune the checker to make this corpus
pass. This preregistration itself is not edited after registration.

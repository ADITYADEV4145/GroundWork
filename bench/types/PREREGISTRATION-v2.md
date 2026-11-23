# Type-aware checking v2: preregistered tool-level gate

This is a **deterministic tool-level evaluation, NOT an agent run**. V2 exists
because v1's designated-clean history set included intentionally broken fixtures
(`bad2.ts` and `expect:` annotations). V1's original verdict and all earlier runs
remain published, including its false-block-rule failure and incomplete coverage.
Do not reinterpret v1 using v2's exclusions or pool the two versions.

This protocol, generator, manifest, runner support and harness tests are committed
before any v2 arm is run or any v2 result exists. No further checker tuning follows
v2 results. Publish PASS, FAIL or INCOMPLETE either way.

## Frozen inputs and mutations

- Source/history anchor: `fdc71900a4c47be2f52a2cb36a727609ca7331b1`.
- Manifest: `bench/types/mutations-v2.json`.
- Manifest SHA256: `39a6b718d71443c161323b74d831d8f0dd1454071c04b7fdaddc1820d7fadc93`.
- Seed: `29061993` (v1 used `17021991`).
- Generation: `node bench/types/generate.mjs fdc71900a4c47be2f52a2cb36a727609ca7331b1 --v2`.
- Compilers: project-resolved TypeScript `5.9.3`, Pyright `1.1.414`; Node `v24.22.2`.
  Provision the same installed development dependencies through each target's
  node_modules symlink. No downloads or historical lockfile installs.

Use the same four source corpora as v1: customer-desk, parcel-ops, dispatch-desk
with grounding reference workflows, plus GroundWork src/. Every mutation is an
independent single-line real API error, reset to its frozen baseline afterwards.
The syntax-only generator never invokes either checker arm. Freeze before/after
lines, source hashes, IDs, locations and operators. Verify them before evaluation.

The same six operators produce **93 mutations**: unknown-export 16, arity 15,
return-member 16, argument-type 16, annotated-property 15, non-callable 15.
As in v1, rank eligible candidates by SHA256(seed + ':' + JSON.stringify(candidate))
and take four per repo/operator, or all if fewer. V2 uses missing-name suffix
`_v2`, incompatible boolean/string argument substitutions, and invokes scalar
members with `(0)` instead of `()`. Arity still removes required arguments.
Exclude every candidate whose `[repo, file, before, after]` matches any frozen v1
mutation (ignore line shifts). There are **zero exact overlaps** by that key.
Sites/operator families still overlap: this is not an independent population
sample. No mutation may be removed based on observed detection.

## Mechanically defined clean set and balance

Walk non-merge commits reachable from the anchor, newest first, touching tracked
`*.ts` files. No unmerged/all-ref history. For each parent-to-commit pair:

1. Enumerate added/modified tracked TypeScript files with
   `git diff --no-renames --name-only --diff-filter=AM <parent> <commit> -- '*.ts'`.
   Deleted files have no current lines and are not eligible.
2. Exclude a file if **any slash-separated path component starts with `bad`,
   case-insensitively** (`/^bad/i`), or either its parent or committed text contains
   `/(?:\/\/|#)\s*expect:/` anywhere. This deliberately conservative textual rule
   excludes annotations even inside strings; it is not a semantic bug classifier.
   Missing parent files have empty parent text. Do not drop any other file for
   diagnostics, generated outputs, dynamic patching, age, size or timing.
3. Rank remaining filenames by SHA256(seed + ':' + commit + ':' + filename).
   Select at most **four files per commit**, checking all their actual added/
   changed lines. This prevents one large fixture-introduction commit from
   dominating coverage by file count. It does not guarantee equal diagnostic
   counts or equal changed-line counts; keep all findings, with no per-case cap.
4. Keep the newest 40 commits with at least one selected file, or all available
   if fewer. Freeze selected files, exclusion reasons, eligible counts and parents.

There are **35 eligible reachable commits**, with **114 selected file versions**
and at most four from any commit. This adds three commits absent from v1:
`212eefec80adb6f426d632cffc8503b2ee0f9c16`,
`e9afde2dc19ec2a9eeecf930ef1e46f71275377c`, and
`ac027d5ce6f57adee00ed82feab3d290890190a0`.
The source anchor is fixed before this registration; later registration/results
commits cannot enter the clean set. Use the current checker on each actual tree
and its frozen parent, not the historical checker. Retain dependency/compiler
skew as a limitation, not grounds for exclusions.

Also include all three grounding reference solutions applied to their original
workflow targets, checking only changed workflow lines. None carries an excluded
annotation or bad-prefixed path. Total: **38 clean cases**. They remain designated
clean proxies, not independently proven bug-free programs.

## Checker, arms and scoring

The checker includes the requested post-v1 precision fixes already committed in
`212eefec80adb6f426d632cffc8503b2ee0f9c16`: files matching grounding's exported
DYNAMIC_TEXT signal keep type diagnostics informational, and TS 2307 is excluded
from blocking (grounding owns missing modules). No filename-based checker policy
or v2-specific checker tuning is permitted. Record checker commit and source hash.

- A: syntax/import grounding only (`verifyChanged`) after refreshing the index.
- B: A union blocking `typeCheck` findings, on identical changed lines/base.
- Keep v1's deduplication: prefer grounding for same file/line/terminal name;
  retain distinct type code/message diagnostics. Count a seeded mutation once iff
  a block falls on its edited line. False blocks are **blocking findings**, not
  affected commits; list each with provenance and location, plus per-case totals.
- Same default policy and type timeout **4000 ms**. An unavailable compiler,
  timeout or failed arm makes coverage incomplete, never a clean negative.
  Preserve every row and any A results. Do not retry individual failures.

## Timing and decision

Use v1's exact timing protocol on the new frozen GroundWork anchor: quote-only
edit to the TOKEN_ESTIMATE_METHOD line of src/util/tokens.ts, actual changed line
and HEAD base. Measure only the Stop type-check component, not total Stop,
indexing, harness launch or agent latency. Twenty cold calls in fresh processes,
then one recorded warm-up (excluded) and twenty warm calls in one process.
Worker/compiler startup counts. Keep all forty samples, including timeouts;
nearest-rank p50/p95, no outlier removal or retries.

With complete coverage, PASS requires all three original rules:

1. B catches strictly more seeded errors than A.
2. B clean-set blocking findings <= A clean-set blocking findings.
3. Combined Stop type-check p95 <= 4000 ms.

Otherwise publish FAIL, or INCOMPLETE when coverage is missing, retaining each
individual rule's computed result. Run v2 **once** with
`npm run bench:types -- --v2`. Before workspace creation, refuse a manifest/hash
mismatch and verify anchor/history reachability and parents. Write raw findings,
availability, errors, timeouts and timing to `bench/types/results-v2/results.json`
and tables/limitations to `bench/types/results-v2/RESULTS.md`. No result exists at
registration. A fail/incomplete result is published without tuning or rerunning.
The optional post-edit hook stays off; this gate cannot authorize enabling it.

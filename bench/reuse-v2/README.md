# Benchmark v2

`tasks.json` is scorer-only: prompts are agent-visible; helper annotations, hidden acceptance tests and reference patches must not be shared with task agents. Each arm/task runs in a fresh session at the pinned commit. This is a dev-only benchmark, not shipped runtime functionality.

## Scoring

```sh
npm ci
npm run build
npm run bench:v2
# Isolate synthetic experiments from committed acceptance evidence:
npm run bench:v2 -- --runs "$HOME/work/synthetic-runs" --out "$HOME/work/synthetic-results"
```

Inputs default to `bench/reuse-v2/runs/<task_id>/<baseline|groundwork>.json`:

```json
{"task_id":"got-upload-budget","arm":"groundwork","patch":"<unified diff against task.commit>","decisions":["REUSE ..."],"notes":"...","session_id":"...","acus":null}
```

The scorer reuses pinned clones under `~/work/gw-bench-v2`, creates disposable worktrees, applies each patch, injects the behavioral test, removes it afterwards, and runs built Groundwork. It does not invoke agents. Missing dependencies are installed from pinned metadata (got npm dependencies; a Python virtualenv with pytest); `--no-install` requires them to exist. `--cache`, `--python`, `--tasks`, `--labels`, `--runs` and `--out` override paths. Dependencies need network access on first setup; submitted patches never provide installation metadata. Linux, Node >=22, Python >=3.10 with venv/pip, Git and npm are required. Submitted code is executed locally: use a disposable VM for untrusted results. This is not a security sandbox.

Results go to `results/<task>/<arm>.json`, with acceptance output, session/ACU data, labels and all GW findings. Reports are rebuilt from current run inputs, not stale result files. Patch application failures count as task failures. Unavailable checks are explicitly recorded and do not establish zero findings.

Fresh pytest worktrees also need generated version metadata. The scorer builds this from an unpatched pinned worktree once, caches it by commit, injects it for acceptance only, then removes it before GW indexing. This metadata build can fetch build dependencies even with `--no-install` (which only suppresses runtime dependency installation); prewarm the cache before offline scoring.

## Check-only BLOCK evidence wave

`block-tasks.json` contains 16 separate tasks at the same real-repository pins: 12 clone-prone siblings and 4 hard negatives (6 got, 5 Click, 5 pytest). Give baseline agents only the prompt and repository pin, not the sampling kind, reference annotation or rationale. No acceptance tests are supplied for this wave. These tasks solicit independent patches, not predetermined positive findings; hard negatives must receive the same scrutiny as clone-prone tasks.

Place baseline runs in `block-runs/<task_id>/baseline.json` using the same run JSON shape, then run:

```sh
npm run build
npm run bench:v2 -- --suite block
```

This selects `block-tasks.json` and `block-runs/` by default; `--tasks`, `--runs`, `--out` and `--cache` still override paths. Only baseline runs are accepted, and task IDs must be distinct between suites. The scorer prepares fresh pinned worktrees, applies patches and runs GW init/check only. It does not install repository test dependencies, inject pytest version metadata or execute acceptance tests. Cloning may still require network access on first setup. Each result retains apply/execution failures and explicit `UNAVAILABLE` checks; `acceptance` and `success` are null, not inferred from GW status. Task kinds do not determine duplicate labels or review verdicts.

### Wave 3

`block-tasks-wave3.json` adds 56 distinct, previously untargeted reference symbols: 50 clone-prone siblings and 6 hard negatives, all marked `wave: 3`. The approved distribution is 3 got (all clone-prone), 26 Click (23 clone-prone, 3 negatives), and 27 pytest (24 clone-prone, 3 negatives). The original 10–40-line body bound is retained, excluding Python docstrings. The distribution is intentionally Python-heavy: only three unused self-contained got candidates met the bound. Reference bodies have no enclosing-function or receiver dependency; imports and module-level helpers/constants remain available.

```sh
npm run bench:v2 -- --suite block \
  --tasks bench/reuse-v2/block-tasks-wave3.json \
  --runs bench/reuse-v2/block-runs-wave3
```

Only the selected tasks are rescored; shared `block-review.json` retains reviews for the unselected wave. All BLOCK waves retain `suite: "block-v2"`, with globally distinct task IDs identifying the wave. `block-results/<task>/baseline.json` cannot collide across waves; `block-report.{json,md}` describes only the selected wave. No runs or reviewed findings are supplied by task definitions.

### Wave 4

`block-tasks-wave4.json` adds 64 distinct reference symbols unused in waves 1–3: 60 clone-prone Click tasks and four pytest hard negatives, all marked `wave: 4`. The allowed any-split distribution concentrates on Click option builders, decorator factories and small dispatch methods. Receiver-dependent methods now use a new subclass in a new file, retaining the original base context, method decorators and parent-call targets. One standalone progress-bar factory is included; the other 59 clone-prone references are methods. Reference bodies remain 10–40 lines, excluding Python docstrings; no body-size relaxation is needed. No got targets are added in this wave.

```sh
npm run bench:v2 -- --suite block \
  --tasks bench/reuse-v2/block-tasks-wave4.json \
  --runs bench/reuse-v2/block-runs-wave4
```

Outputs are `block-results/<task>/baseline.json` and `block-report.{json,md}`. These never overwrite the reuse-wave results or success/duplicate-rate reports. Every available BLOCK finding (including non-duplicate kinds) enters the shared `block-review.{json,md}` with `suite: "block-v2"` and finding `kind`. Reuse-wave rows are attributed to `reuse-v2`; legacy rows without a suite are treated as reuse-wave rows. Rerunning either suite replaces only the selected tasks' queue, preserves unchanged verdicts, and retains unselected tasks and the other suite's rows. Changed evidence clears its verdict. Reviewers must inspect actual behavior, especially any BLOCK on a hard negative; the task annotation is not itself evidence. Authoring or scoring this wave does not establish the ten-reviewed-BLOCK gate.

### Wave 5

`block-tasks-wave5.json` adds 30 clone-prone tasks and three hard negatives with distinct reference symbols unused in waves 1–4. The distribution is seven got (six clone-prone, one negative), 13 Click (12 clone-prone, one negative), and 13 pytest (12 clone-prone, one negative). Every task records `wave: 5` and `copy_inviting: true`. Clone-prone prompts explicitly invite copying the named behavior with one concrete tweak; the earlier no-copy-wording rule does not apply. Hard negatives instead request callable-field inventories, structured prompt descriptions, and name-frequency reports, not the superficially similar request predicate, prompt string, or de-duplication result.

All prompts require a new standalone module and forbid importing, subclassing or calling the original, including aliases and wrappers, with an explicit isolation reason. References are top-level functions without receiver or enclosing-function state. Python factories receive constructors and support callables explicitly so they remain importable without Click/pytest; no subclass context is needed. This wave does not impose the earlier 10–40-line body bound: reference source spans are 3–88 lines including signatures and docstrings, with short unused got predicates supplying part of the got minimum.

```sh
npm run bench:v2 -- --suite block \
  --tasks bench/reuse-v2/block-tasks-wave5.json \
  --runs bench/reuse-v2/block-runs-wave5
```

No wave-5 runs or review verdicts are supplied by these definitions. Keep synthetic smoke-test runs and outputs outside the committed evidence directory using `--runs` and `--out`.

### Wave 6

**Waves 5–6 are copy-inviting by design. Their BLOCKs measure precision on agent-made copies, not natural duplicate incidence or task success.** Hard negatives remain behavioral contrasts and must be reviewed on their actual implementations, not their task labels.

`block-tasks-wave6.json` contains 24 clone-prone tasks (12 Click, 12 pytest, no got) and three hard negatives (one per repository), with distinct reference symbols unused in waves 1–5. Every task records `wave: 6` and `copy_inviting: true`; clone-prone tasks require `vendoring: true`, while hard negatives explicitly require `vendoring: false` and no vendoring. Clone prompts require a renamed, unchanged vendored body in a new module, with the single behavior change isolated in a separate small wrapper. Supporting private helpers, classes, constants and state must also be vendored locally as needed; original-package imports or injected substitutes are not allowed. Standard-library and existing lazy optional third-party dependencies remain allowed.

The eligible unused **got production target pool is exhausted**. Of its nine unused top-level function symbols at the pin, three are one-line functions, two span eight lines including signatures/braces (fewer than eight body lines), and four span 87–214 lines. Aditya approved replacing the eight got clones with four extra Click and four extra pytest clones, retaining one got negative with a short reference exception: `source/core/options.ts::init` (six body lines). No previously targeted reference was reused.

All 24 clone reference bodies are 8–40 lines, measured from the first non-docstring body statement through the last statement, including internal comments and blank lines but excluding signatures and leading docstrings. Targets have no receiver or enclosing-function state. Platform-conditional module-level definitions count as top-level lexical functions: the ANSI wrapper explicitly selects the Windows definition and `raw_terminal` explicitly selects the POSIX definition, not the one-line Windows implementation. Prompts specify dependency vendoring plans, platform guards and mocked native/terminal tests rather than requiring a Windows host or live terminal. Hard negatives instead request hook-name inventories without invocation, deprecation-alias schemas without class resolution, and structured source-availability reports with different exception handling.

```sh
npm run bench:v2 -- --suite block \
  --tasks bench/reuse-v2/block-tasks-wave6.json \
  --runs bench/reuse-v2/block-runs-wave6
```

This code-only split intentionally omits the wave-3–6 raw runs, scored results and review evidence retained on `devin/1795297753-bench-v2-wave3`. Task definitions alone do not finish the gate; thresholds stay at least 10 independent reviewed pairs and at least 90% agreement. Review every subsequent raw BLOCK honestly and retain the same file/nested coverage exclusions.

## Labels and recorded review

Agent review is accepted for the BLOCK gate per Aditya's decision. The recorded reviewer on the evidence branch's reviewed BLOCK rows is `Devin lead review (agent, not Aditya)`; that attribution names the reviewing agent, not Aditya as the reviewer. New reviews must likewise name their actual reviewer on each row. Agent review is not a reason to skip a row or fail the gate; the thresholds remain at least 10 independent reviewed pairs with at least 90% agreement. Reviewer identity is recorded, not independently authenticated.

Automated labels use added production call sites and static import resolution, including import aliases. A resolved helper call is provisionally `reused`; added implementations without such a call are provisionally `duplicate`; no implementation or unavailable analysis is `unknown`. This is a heuristic, not semantic analysis: indirect calls, shadowed names, dead calls or mixed reused/duplicated implementations need review. Agent `decisions` are not trusted. Unknowns are excluded from duplicate-rate denominators and separately counted; they prevent a passing benchmark gate.

Override with `labels.jsonl` (one unique row per task/arm):

```json
{"task_id":"got-upload-budget","arm":"baseline","label":"duplicate","reviewer":"Human name","reasoning":"Both byte-counting implementations inspect strings and content-length."}
```

Allowed labels: `reused`, `duplicate`, `unknown`. Overrides take precedence. The binary duplicate metric counts tasks/runs labeled duplicate, not the number of duplicated functions. Review every BLOCK duplicate finding in `block-review.json` by filling `verdict` (`agree`/`disagree`), `reviewer` and `reasoning`; reruns preserve matching evidence's reviews and remove stale findings. Reviewer identity is recorded, not authenticated. `block-review.md` retains every row but reports agreement over distinct file-qualified added/existing symbol pairs, ignoring repeated tasks, arms and line numbers. A duplicate-file row is excluded from distinct counts when its file pair is covered by an attributed symbol-level duplicate review. Standalone file pairs still count once. Conflicting attributed verdicts on one pair count as disagreement; pending rows do not inflate reviewed counts.

## Interpretation

Historical false-positive rows may carry `resolved_by: { "commit": "<40-character fix SHA>", "note": "..." }` without losing their disagreement or reviewer. Scoring retains these rows even when the BLOCK disappears. The gate excludes an attributed disagreement only when the current stored result for the same suite, task and arm scored successfully and no longer contains that BLOCK kind and added/existing file-qualified symbol pair. Line-number changes do not count as removal. Missing, malformed, failed or unavailable scoring does not resolve a row; a reappearing BLOCK counts again. Markdown and selftest report `N false-positive rows excluded after detector fix <sha>` and retain every historical review row.

Reports show per-arm duplicate rates and task success with Wilson 95% intervals, baseline-minus-groundwork differences with independent-proportions Newcombe method-10 intervals, ACUs (not tokens), and available GW BLOCK/WARN counts plus unavailable-check counts. These intervals do not account for paired tasks or task correlation. Missing tasks/arms are visible in `report.json`; partial and synthetic runs are not a completed 20-task experiment.

Nested-function pairs are excluded from independent counts when an attributed reviewed enclosing added symbol has a BLOCK against an enclosing existing symbol in the same file pair. Both sides must have dotted symbol ancestry; unrelated existing functions are not covered. The report retains both distinct symbol-pair and independent-pair counts, plus every raw review row.

Cheap Phase 3 checks read stored files only, even under `--quick`. Absent evidence skips; malformed or insufficient evidence fails. BLOCK review needs >=10 independent attributed reviewed pairs with >=90% agreement. The benchmark gate uses strict duplicate-rate reduction and groundwork success >= baseline success **at the point estimate**, per the requested criterion; it is not a confidence-bound noninferiority claim. The report retains intervals for interpretation. Do not place synthetic output at the default evidence paths.

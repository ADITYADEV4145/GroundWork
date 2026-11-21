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

Outputs are `block-results/<task>/baseline.json` and `block-report.{json,md}`. These never overwrite the reuse-wave results or success/duplicate-rate reports. Every available BLOCK finding (including non-duplicate kinds) enters the shared `block-review.{json,md}` with `suite: "block-v2"` and finding `kind`. Reuse-wave rows are attributed to `reuse-v2`; legacy rows without a suite are treated as reuse-wave rows. Rerunning either suite replaces only that suite's queue, preserves unchanged verdicts, and retains the other suite's rows. Changed evidence clears its verdict. Reviewers must inspect actual behavior, especially any BLOCK on a hard negative; the task annotation is not itself evidence. Authoring or scoring this wave does not establish the ten-reviewed-BLOCK gate.

Keep synthetic smoke-test runs and outputs outside the committed evidence directory using `--runs` and `--out`.

## Labels and human review

Automated labels use added production call sites and static import resolution, including import aliases. A resolved helper call is provisionally `reused`; added implementations without such a call are provisionally `duplicate`; no implementation or unavailable analysis is `unknown`. This is a heuristic, not semantic analysis: indirect calls, shadowed names, dead calls or mixed reused/duplicated implementations need review. Agent `decisions` are not trusted. Unknowns are excluded from duplicate-rate denominators and separately counted; they prevent a passing benchmark gate.

Override with `labels.jsonl` (one unique row per task/arm):

```json
{"task_id":"got-upload-budget","arm":"baseline","label":"duplicate","reviewer":"Human name","reasoning":"Both byte-counting implementations inspect strings and content-length."}
```

Allowed labels: `reused`, `duplicate`, `unknown`. Overrides take precedence. The binary duplicate metric counts tasks/runs labeled duplicate, not the number of duplicated functions. Review every BLOCK duplicate finding in `block-review.json` by filling `verdict` (`agree`/`disagree`), `reviewer` and `reasoning`; reruns preserve matching evidence's reviews and remove stale findings. Reviewer identity is recorded, not authenticated. `block-review.md` shows the reviewed-row agreement, not agreement over pending rows.

## Interpretation

Reports show per-arm duplicate rates and task success with Wilson 95% intervals, baseline-minus-groundwork differences with independent-proportions Newcombe method-10 intervals, ACUs (not tokens), and available GW BLOCK/WARN counts plus unavailable-check counts. These intervals do not account for paired tasks or task correlation. Missing tasks/arms are visible in `report.json`; partial and synthetic runs are not a completed 20-task experiment.

Cheap Phase 3 checks read stored files only, even under `--quick`. Absent evidence skips; malformed or insufficient evidence fails. BLOCK review needs >=10 attributed reviewed rows with >=90% agreement. The benchmark gate uses strict duplicate-rate reduction and groundwork success >= baseline success **at the point estimate**, per the requested criterion; it is not a confidence-bound noninferiority claim. The report retains intervals for interpretation. Do not place synthetic output at the default evidence paths.

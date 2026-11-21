# Gather long-horizon feature suite

Ten sequential edit tasks on **one** dependency-free event-operations repository,
`fixtures/long-horizon-events`, pinned by `tasks.json`. Sequence `gather-launch`
starts with reusable slug, date, retry, validation, CSV and collection helpers.
Features build on prior work: cards → invitations → agenda → reminders → roster
→ capacity → CSV → organizer digest → delivery → dashboard. Every step must
preserve earlier acceptance contracts. No shared harness files are modified.

## Recorded Devin-agent results

**Devin-agent results (6 sessions: 3 baseline, 3 Groundwork; 10 sequential tasks each); tokens are estimated tool-output tokens (bytes/4), not model tokens**

<!-- long-horizon-results:start -->
| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 30/30 (100.0%) | 30/30 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 143.8 | 179.4 |
| Captured tool calls | 58 | 115 |
| Distinct directly read files (summed across attempts) | 14 | 21 |
| Direct source-read bytes | 4932 | 7398 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 8.3 | 11.2 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-76.8% (95% bootstrap interval [-82.8, -36.8]%)**.
Provider input token reduction: unavailable. Wall time reduction: -15.2% (95% bootstrap interval [-49.0, -10.5]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 20 | 17 | 0.0 (95% bootstrap interval [-0.2, 0.0]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |
<!-- long-horizon-results:end -->

**Groundwork used more estimated tool-output tokens and more wall time; these
sessions do not demonstrate savings.** Negative reductions mean increases.
These are the reporter's medians across tasks, not ratios of suite totals. Its
95% task-bootstrap intervals condition on these sessions, do not estimate
variation across independent model runs, and do not account for dependence
between sequential tasks. Provider token usage and model identity were not
exposed. Duplicate counts are raw scorer findings, not labeled clone counts.

### Collection deviations

- Groundwork run 3 authored files in a staging directory and copied them into
  task workspaces via the shell wrapper. Its patches contain ordinary feature
  source and replay successfully; that does not establish complete accounting
  for staging-file authoring/read costs or time outside task begin/finish.
- Two runs each had one failed-then-retried tool call, as reported during
  collection. The capture JSON lacks command text and error status, so it
  cannot independently identify those calls. The supplied captures are stored
  unchanged; no retries were filtered out.
- One Devin session per arm/run carried context across ten steps. This is a
  small local event-library fixture, not evidence of performance on large
  production repositories. Results do not establish end-to-end model-token
  savings.

### Evidence and offline reproduction

The six [raw observations](observations/) retain original run labels 1–3 for
both arms; none of the provisional two-pair relabeling is used. Each pins source
`e366bbcd1944f81d118c486db4d1d8e6feeda705` and collector revision
`34ea4c11efc47ffe7781308b31bdbf903e45f166`. The complete
[report](results/2026-11-21T20-56-14-672Z-long-horizon.md),
[JSON](results/2026-11-21T20-56-14-672Z-long-horizon.json) and dated graded evidence
are committed under `results/`. [evidence.json](evidence.json) is the same graded
evidence at the fixed path expected by the shared reporter. Its task/verifier
digest is checked on replay. The evidence and results additionally record an
`evaluator` SHA-256 fingerprint: every suite `.mjs` file (including acceptance,
metrics, validation and verification helpers), the task manifest and every
fixture file. `verify-results.mjs` checks both the file list and each file's
bytes, rejecting edits, additions or deletions. Run it alongside shared replay;
the shared reporter alone checks only its manifest/grade digest. This local
fingerprint does not hash Node or third-party packages; the original collector
revision and dependency lockfile define that environment.

After `npm ci && npm run build`, reproduce the report offline, without agents,
network access or execution of captured patches:

```sh
node dist/cli/main.js bench --suite long-horizon --runs 3 \
  --output-dir /path/to/reproduced-results
node bench/long-horizon/verify-results.mjs
```

To regrade all trusted patches instead of replaying graded evidence:

```sh
node dist/cli/main.js bench --suite long-horizon --runs 3 \
  --observations bench/long-horizon/observations --output-dir /path/to/regraded-results
```

## Run

From the Groundwork source checkout, with Node 22+ and Git:

```sh
npm ci
npm run build
node bench/long-horizon/validate.mjs
export GW_BENCH_SUITE=long-horizon
node bench/capture.mjs list
node bench/capture.mjs init /absolute/path/to/new-state groundwork 1
node bench/capture.mjs begin /absolute/path/to/new-state lh-01
node bench/capture.mjs mcp /absolute/path/to/new-state lh-01 repo_map '{}'
node bench/capture.mjs read /absolute/path/to/new-state lh-01 README.md
# Give the agent the lh-01 prompt and capture all shell edits/searches:
node bench/capture.mjs shell /absolute/path/to/new-state lh-01 '<one short shell edit/search command>'
node bench/capture.mjs finish /absolute/path/to/new-state lh-01
# Continue begin/tools/finish with lh-02 through lh-10, in order.
# begin restores and commits every prior step patch before the current task.
node bench/capture.mjs export /absolute/path/to/new-state > /path/to/captures/groundwork-1.json
```

For baseline use a separate state/session and `init ... baseline 1`, no MCP or
Groundwork instructions. Repeat both arms with runs 2 and 3, using identical
agent/model/settings and retaining the same session across the ten steps within
each arm/run. Never reveal `validation/` reference implementations to the agent.
Capture provider token usage separately if available; the harness's bytes/4
counter is only **estimated tool-output tokens**, not total provider input tokens.
The existing reporter groups by step/category and reports duplication, invented
calls and token estimates across tasks; retain step IDs when examining growth.

Grade all six trusted capture exports using the shared harness:

```sh
node dist/cli/main.js bench --suite long-horizon --runs 3 \
  --observations /path/to/captures --output-dir bench/long-horizon/results
```

Only score **trusted patches**: this executes submitted JavaScript. Worktrees and
timeouts provide reproducibility, not a security sandbox. The recorded results
above came from the six observations, not evaluator validation. The fixed
`evidence.json` follows `bench/README.md`'s offline workflow. `--suite all`
discovers this suite automatically.

## Grading and measurement definitions

- `grade(task, observation, {withWorkspace})` uses the shared contract. The
  harness supplies a worktree with the first N−1 patches **committed** and the Nth
  patch uncommitted. Grading neither reapplies nor commits patches itself.
- **success:** every `acceptance/step-01.mjs` through `step-N.mjs` exits zero in
  that worktree. Tests cover normal, empty/boundary and invalid inputs, stable
  ordering, UTC dates, error propagation, delivery retry exhaustion, escaping,
  deduplication and immutable inputs. Behavioral success is independent of the
  two guard metrics: a working but duplicative implementation still succeeds.
- **duplicatesAdded:** the count of distinct Groundwork `checkRepository`
  findings of kind `duplicate`, `duplicate-constant` or `duplicate-file`, WARN
  and BLOCK, versus HEAD. This is a **scorer finding count**, not an independently
  human-labeled clone count; a whole-file and a symbol finding may both count.
  Inherited unchanged duplicates do not count again in later steps.
- **inventedCalls:** distinct `(file,line,kind,name)` unresolved-target findings
  (`missing-module`, `unknown-export`, `unknown-member`) on changed lines from
  `verifyChanged`/Grounder, the exact verifier used by MCP `verify_calls`. Import
  failures are included because the verifier can report an invented target at
  its import rather than each call site. Arity/keyword errors are not unresolved
  targets and are excluded. Dynamic/external/ambiguous calls that the verifier
  deliberately skips are **not** evidence of correctness and are not counted.
- `metrics.mjs` uses the checkout's built Groundwork modules with a fixed default
  evaluator configuration (offline/no embeddings), not agent-provided config.
  Index/parse/measurement failures throw instead of recording zero. Missing or
  invalid patches are unsuccessful and have no measured metrics.

## Evaluator validation

`node bench/long-horizon/validate.mjs` reconstructs pinned worktrees using
`bench/workspace.mjs` and calls the real grader. It checks all ten handwritten
reference patches in sequence. For steps 1 and 2 it also checks:

1. A working patch that actually uses a copied helper and exports a function
   calling a nonexistent member of the real date module. Behavioral tests still
   pass, but both guard metrics must be positive.
2. A broken implementation whose acceptance must fail.
3. An empty patch is rejected without entering a worktree.

These are evaluator regression tests, **not agent benchmark observations**.
The default scorer currently reports two duplicate findings on each reference
patch for steps 3, 7, 8 and 10, despite their behavioral success. Treat these as
raw scorer measurements, not a claim of independently calibrated clone accuracy.

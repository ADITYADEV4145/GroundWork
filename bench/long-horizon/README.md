# Gather long-horizon feature suite

Ten sequential edit tasks on **one** dependency-free event-operations repository,
`fixtures/long-horizon-events`, pinned by `tasks.json`. Sequence `gather-launch`
starts with reusable slug, date, retry, validation, CSV and collection helpers.
Features build on prior work: cards → invitations → agenda → reminders → roster
→ capacity → CSV → organizer digest → delivery → dashboard. Every step must
preserve earlier acceptance contracts. No shared harness files are modified.

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
timeouts provide reproducibility, not a security sandbox. `results/` is the
suggested location for future measured results; none are fabricated or committed
by validation. To reproduce captured results offline, follow `bench/README.md`'s
`evidence.json` workflow. `--suite all` discovers this suite automatically.

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

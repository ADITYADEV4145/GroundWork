# DefectsAtDone preregistration, version 1

Status: registered before any agent session was run on this suite. No results exist yet.
A confirmatory run names this file with `gw bench run --suite defects-at-done --prereg bench/prereg/defects-at-done-v1.md`;
the harness refuses the file unless it is committed and unmodified, and stores its commit and SHA-256 in the run.
Any change to the rules below is a new file (`-v2.md`), never an edit to this one.

## Question

When a coding agent says it is done, how many defects does the change contain, with and without GroundWork, and with each competitor tool?

## Arms

`native` (no added tool), `groundwork`, three ablations (`groundwork-no-grounding`, `groundwork-no-reuse`, `groundwork-no-types`),
and the competitor arms in `bench/defects-at-done/arms.json` (`serena`, `codebase-memory`, `augment`).
Every arm gets the same agent, model, prompt text, turn budget (60 per prompt) and wall-time budget (1200 s per prompt).
A competitor arm runs only once its version and launch command are pinned in `arms.json`, installed as its own documentation says.
Its maintainers are invited to review that setup before the run; the invitation and any reply are linked from the results.
An arm that is not run is listed as not run, with the reason. It is never described as beaten.

## Tasks and grading

Tasks, fixtures, hidden checks and the grader are frozen by the task-set hash (`taskSetHash`) and `GRADER_VERSION`.
Every record stores both; a report refuses to mix hashes. Six categories: hidden helper, near name, changed signature, ripple, compaction, real failure.

Conditions that must all hold before the confirmatory run starts:

1. At least 60 tasks, at least 8 per category, on at least three languages. Real-failure tasks cite a public source and pin its revision.
2. `gw bench validate --suite defects-at-done` passes: every untouched workspace fails, every reference solution passes with zero defects.
3. Grader audit: two people label at least 50 graded defect items from a pilot run without seeing the grader's label;
   agreement between the grader and the adjudicated human label is at least 90%, and the audit file is committed.
4. A dry run of one task per category completes on every arm that will be reported, with valid captures.

Pilot sessions used for 3 and 4 are exploratory and are not counted in the confirmatory run.

## Outcomes

Primary: defects per task at the moment the agent finishes (invented calls, wrong arguments, duplicate implementations, type errors, missed callers and docs, failing affected tests), summed.
Secondary: task success (hidden and visible checks pass), wall time, provider-billed tokens, defects by type.
Tokens are reported only when the provider's own usage numbers were captured for every compared session; nothing is estimated.

## Hypotheses and pass rules

Each is judged on the paired task-level estimate against `native`, three replicates per task and arm averaged per task.

| # | Claim | Passes when |
| --- | --- | --- |
| H1 | GroundWork cuts defects at done | reduction is at least 50% and the lower 95% bound is above 0 |
| H2 | It does not cost task success | lower 95% bound of the success difference is above -5 points |
| H3 | It does not cost time | the whole 95% interval of the wall-time ratio lies between 0.95 and 1.05 |
| H4 | It does not cost tokens | upper 95% bound of the provider-billed token ratio is at most 1.00, with usage captured for every session |
| H5 | It has the lowest defect rate | lower than native and all three competitor arms, each complete with no invalid session |

A hypothesis with incomplete evidence is reported as "not evaluated", never as passed. H3 and H4 failing means no speed or cost claim is made.
No other comparison from this run is presented as a finding; ablations and per-type counts are descriptive.

## Analysis

95% percentile bootstrap intervals, 10,000 resamples over tasks, pairs kept together, fixed seed.
Sample size: the standard deviation of the per-task defect difference is taken from the dry run and `tasksNeeded(sd, delta)`
(two-sided 5%, 80% power) gives the minimum task count for detecting half the native defect rate; the run uses the larger of that and 60.

## Invalid runs and exclusions

A session is invalid only for infrastructure reasons recorded by the harness: time budget hit, agent process failed to start, checks could not start, index failure.
Invalid sessions are kept and listed with their reason in the report. No task or session is removed for its outcome.
A task counts for a comparison only if both arms have at least one valid session on it.
If the native or GroundWork arm has any missing or invalid session, H1 to H5 are reported as not evaluated; the same holds for H5 if a competitor arm does.
Rerunning invalid sessions is a new run under a new run id, published next to the first.

## Publication

The full record set, transcripts, report and leaderboard are published whatever the outcome, including failed hypotheses and invalid sessions.

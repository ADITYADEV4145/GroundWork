# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `36f54a0845fe2bf4184549cf5cef8f216a8957ab`.
10 tasks × 16 paired repeats (160 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 160/160 (100.0%) | 160/160 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 140.7 | 175.4 |
| Captured tool calls | 313 | 293 |
| Distinct directly read files (summed across attempts) | 77 | 7 |
| Direct source-read bytes | 26474 | 1665 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 7.2 | 9.2 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-43.2% (95% bootstrap interval [-64.3, -7.0]%)**.
Provider input token reduction: unavailable. Wall time reduction: -29.0% (95% bootstrap interval [-39.5, -19.9]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 160/160 (100.0%) | 160/160 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 16/16 | 16/16 | 717.5 | 908.6 | -26.6% |
| lh-02 (gather-launch #2) | feature | 16/16 | 16/16 | 55.0 | 103.7 | -88.7% |
| lh-03 (gather-launch #3) | feature | 16/16 | 16/16 | 77.1 | 67.4 | 12.5% |
| lh-04 (gather-launch #4) | feature | 16/16 | 16/16 | 49.5 | 70.2 | -42.0% |
| lh-05 (gather-launch #5) | feature | 16/16 | 16/16 | 52.2 | 80.0 | -53.2% |
| lh-06 (gather-launch #6) | feature | 16/16 | 16/16 | 47.5 | 87.5 | -84.1% |
| lh-07 (gather-launch #7) | feature | 16/16 | 16/16 | 46.5 | 67.3 | -44.8% |
| lh-08 (gather-launch #8) | feature | 16/16 | 16/16 | 117.5 | 143.8 | -22.4% |
| lh-09 (gather-launch #9) | feature | 16/16 | 16/16 | 54.4 | 78.6 | -44.5% |
| lh-10 (gather-launch #10) | feature | 16/16 | 16/16 | 189.6 | 147.2 | 22.4% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 9738.6 | 11303.7 | -16.1% (95% bootstrap interval [-25.1, -7.5]%) |
| emittedBytesPerSession | 5627.2 | 7017.4 | -24.7% (95% bootstrap interval [-54.0, -2.1]%) |
| toolSideMsPerSession | 559.8 | 1554.0 | -177.6% (95% bootstrap interval [-330.2, -74.0]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -26.25528318946937%.

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 46 | 48 | 0.0 (95% bootstrap interval [-0.1, 0.1]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

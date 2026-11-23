# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `e3bdc7401daf7264b242b32a2d7bc4de09178f69`.
10 tasks × 16 paired repeats (160 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 160/160 (100.0%) | 160/160 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 128.7 | 158.3 |
| Captured tool calls | 279 | 277 |
| Distinct directly read files (summed across attempts) | 63 | 6 |
| Direct source-read bytes | 21824 | 872 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 6.1 | 7.8 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-4.9% (95% bootstrap interval [-23.1, 7.7]%)**.
Provider input token reduction: unavailable. Wall time reduction: -25.4% (95% bootstrap interval [-43.7, -20.3]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 160/160 (100.0%) | 160/160 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 16/16 | 16/16 | 728.4 | 1045.4 | -43.5% |
| lh-02 (gather-launch #2) | feature | 16/16 | 16/16 | 42.5 | 52.3 | -23.1% |
| lh-03 (gather-launch #3) | feature | 16/16 | 16/16 | 84.4 | 59.8 | 29.2% |
| lh-04 (gather-launch #4) | feature | 16/16 | 16/16 | 28.7 | 29.4 | -2.3% |
| lh-05 (gather-launch #5) | feature | 16/16 | 16/16 | 36.2 | 38.9 | -7.5% |
| lh-06 (gather-launch #6) | feature | 16/16 | 16/16 | 39.7 | 37.2 | 6.4% |
| lh-07 (gather-launch #7) | feature | 16/16 | 16/16 | 41.7 | 52.4 | -25.6% |
| lh-08 (gather-launch #8) | feature | 16/16 | 16/16 | 116.2 | 91.1 | 21.6% |
| lh-09 (gather-launch #9) | feature | 16/16 | 16/16 | 46.7 | 43.1 | 7.7% |
| lh-10 (gather-launch #10) | feature | 16/16 | 16/16 | 123.0 | 133.8 | -8.8% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 9418.6 | 10215.9 | -8.5% (95% bootstrap interval [-19.9, 1.5]%) |
| emittedBytesPerSession | 5149.9 | 6333.3 | -23.0% (95% bootstrap interval [-45.6, -2.4]%) |
| toolSideMsPerSession | 506.2 | 1242.2 | -145.4% (95% bootstrap interval [-225.6, -81.8]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -21.462840764173862%.

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 43 | 38 | 0.0 (95% bootstrap interval [-0.1, 0.0]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

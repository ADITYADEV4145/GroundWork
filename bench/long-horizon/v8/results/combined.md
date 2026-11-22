# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `243bb549e352ee4a63e968230055cda0c165bbe5`.
10 tasks × 16 paired repeats (160 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 160/160 (100.0%) | 160/160 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 146.5 | 169.4 |
| Captured tool calls | 288 | 281 |
| Distinct directly read files (summed across attempts) | 49 | 3 |
| Direct source-read bytes | 16936 | 429 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.7 | 8.5 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-4.5% (95% bootstrap interval [-16.1, 23.5]%)**.
Provider input token reduction: unavailable. Wall time reduction: -48.1% (95% bootstrap interval [-67.9, -38.8]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 160/160 (100.0%) | 160/160 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 16/16 | 16/16 | 728.4 | 1043.4 | -43.2% |
| lh-02 (gather-launch #2) | feature | 16/16 | 16/16 | 53.3 | 59.5 | -11.8% |
| lh-03 (gather-launch #3) | feature | 16/16 | 16/16 | 79.1 | 60.5 | 23.5% |
| lh-04 (gather-launch #4) | feature | 16/16 | 16/16 | 31.0 | 34.9 | -12.5% |
| lh-05 (gather-launch #5) | feature | 16/16 | 16/16 | 47.9 | 57.7 | -20.5% |
| lh-06 (gather-launch #6) | feature | 16/16 | 16/16 | 51.5 | 52.2 | -1.2% |
| lh-07 (gather-launch #7) | feature | 16/16 | 16/16 | 53.3 | 53.8 | -0.9% |
| lh-08 (gather-launch #8) | feature | 16/16 | 16/16 | 144.6 | 109.8 | 24.1% |
| lh-09 (gather-launch #9) | feature | 16/16 | 16/16 | 61.8 | 66.7 | -7.8% |
| lh-10 (gather-launch #10) | feature | 16/16 | 16/16 | 213.8 | 155.4 | 27.3% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 9308.2 | 10814.7 | -16.2% (95% bootstrap interval [-28.7, -4.7]%) |
| emittedBytesPerSession | 5858.8 | 6774.7 | -15.6% (95% bootstrap interval [-40.5, 8.2]%) |
| toolSideMsPerSession | 504.3 | 1561.3 | -209.6% (95% bootstrap interval [-324.3, -129.9]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -30.452889749715983%.

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 45 | 37 | 0.0 (95% bootstrap interval [-0.3, 0.1]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

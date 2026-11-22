# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `01b142647e338ce557ef85bb7ef6c15e0c4f9257`.
10 tasks × 16 paired repeats (160 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 160/160 (100.0%) | 160/160 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 145.4 | 171.5 |
| Captured tool calls | 281 | 276 |
| Distinct directly read files (summed across attempts) | 77 | 0 |
| Direct source-read bytes | 27126 | 0 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 7.7 | 8.3 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **8.8% (95% bootstrap interval [0.1, 18.5]%)**.
Provider input token reduction: unavailable. Wall time reduction: -0.9% (95% bootstrap interval [-15.1, 2.8]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 160/160 (100.0%) | 160/160 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 16/16 | 16/16 | 795.5 | 1120.6 | -40.9% |
| lh-02 (gather-launch #2) | feature | 16/16 | 16/16 | 58.2 | 41.6 | 28.5% |
| lh-03 (gather-launch #3) | feature | 16/16 | 16/16 | 74.1 | 68.3 | 7.8% |
| lh-04 (gather-launch #4) | feature | 16/16 | 16/16 | 34.1 | 24.8 | 27.3% |
| lh-05 (gather-launch #5) | feature | 16/16 | 16/16 | 44.6 | 44.5 | 0.1% |
| lh-06 (gather-launch #6) | feature | 16/16 | 16/16 | 49.9 | 44.4 | 11.1% |
| lh-07 (gather-launch #7) | feature | 16/16 | 16/16 | 45.2 | 40.5 | 10.4% |
| lh-08 (gather-launch #8) | feature | 16/16 | 16/16 | 122.6 | 116.2 | 5.2% |
| lh-09 (gather-launch #9) | feature | 16/16 | 16/16 | 55.2 | 56.1 | -1.7% |
| lh-10 (gather-launch #10) | feature | 16/16 | 16/16 | 174.7 | 157.6 | 9.8% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 9836.6 | 10536.8 | -7.1% (95% bootstrap interval [-19.7, 3.9]%) |
| emittedBytesPerSession | 5816.1 | 6858.4 | -17.9% (95% bootstrap interval [-27.6, -8.7]%) |
| toolSideMsPerSession | 523.5 | 1253.1 | -139.4% (95% bootstrap interval [-206.7, -88.9]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -21.617720631710213%.

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 38 | 44 | 0.0 (95% bootstrap interval [-0.1, 0.1]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

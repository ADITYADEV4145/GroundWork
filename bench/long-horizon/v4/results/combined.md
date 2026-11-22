# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `ff578514d78397faffd2ac1836fb3cbd03e62ee1`.
10 tasks × 8 paired repeats (80 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 80/80 (100.0%) | 80/80 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 151.7 | 152.5 |
| Captured tool calls | 164 | 264 |
| Distinct directly read files (summed across attempts) | 49 | 11 |
| Direct source-read bytes | 17547 | 2896 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 6.6 | 10.3 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **1.6% (95% bootstrap interval [-23.3, 20.1]%)**.
Provider input token reduction: unavailable. Wall time reduction: -73.5% (95% bootstrap interval [-98.1, -35.4]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 80/80 (100.0%) | 80/80 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 8/8 | 8/8 | 762.6 | 900.9 | -18.1% |
| lh-02 (gather-launch #2) | feature | 8/8 | 8/8 | 74.9 | 71.5 | 4.5% |
| lh-03 (gather-launch #3) | feature | 8/8 | 8/8 | 101.7 | 47.7 | 53.1% |
| lh-04 (gather-launch #4) | feature | 8/8 | 8/8 | 38.1 | 41.5 | -8.9% |
| lh-05 (gather-launch #5) | feature | 8/8 | 8/8 | 72.7 | 66.9 | 8.0% |
| lh-06 (gather-launch #6) | feature | 8/8 | 8/8 | 42.1 | 57.9 | -37.7% |
| lh-07 (gather-launch #7) | feature | 8/8 | 8/8 | 41.5 | 58.2 | -40.1% |
| lh-08 (gather-launch #8) | feature | 8/8 | 8/8 | 172.5 | 100.9 | 41.5% |
| lh-09 (gather-launch #9) | feature | 8/8 | 8/8 | 46.9 | 47.5 | -1.3% |
| lh-10 (gather-launch #10) | feature | 8/8 | 8/8 | 163.7 | 131.4 | 19.7% |

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 23 | 22 | 0.0 (95% bootstrap interval [-0.1, 0.0]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

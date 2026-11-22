# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `fa8657cbb6bc73dfb9a8011b891f55b6af499eda`.
10 tasks × 8 paired repeats (80 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 80/80 (100.0%) | 80/80 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 144.5 | 201.0 |
| Captured tool calls | 159 | 306 |
| Distinct directly read files (summed across attempts) | 38 | 57 |
| Direct source-read bytes | 13167 | 19547 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.2 | 11.0 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-63.2% (95% bootstrap interval [-86.1, -38.6]%)**.
Provider input token reduction: unavailable. Wall time reduction: -110.1% (95% bootstrap interval [-132.7, -91.5]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 80/80 (100.0%) | 80/80 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 8/8 | 8/8 | 720.1 | 838.5 | -16.4% |
| lh-02 (gather-launch #2) | feature | 8/8 | 8/8 | 66.3 | 105.0 | -58.3% |
| lh-03 (gather-launch #3) | feature | 8/8 | 8/8 | 73.3 | 136.5 | -86.4% |
| lh-04 (gather-launch #4) | feature | 8/8 | 8/8 | 38.9 | 72.3 | -86.1% |
| lh-05 (gather-launch #5) | feature | 8/8 | 8/8 | 52.4 | 121.9 | -132.8% |
| lh-06 (gather-launch #6) | feature | 8/8 | 8/8 | 53.3 | 95.3 | -78.7% |
| lh-07 (gather-launch #7) | feature | 8/8 | 8/8 | 55.6 | 91.1 | -63.9% |
| lh-08 (gather-launch #8) | feature | 8/8 | 8/8 | 161.5 | 223.9 | -38.6% |
| lh-09 (gather-launch #9) | feature | 8/8 | 8/8 | 68.2 | 110.8 | -62.4% |
| lh-10 (gather-launch #10) | feature | 8/8 | 8/8 | 155.0 | 214.2 | -38.1% |

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 58 | 62 | 0.0 (95% bootstrap interval [-0.1, 0.3]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

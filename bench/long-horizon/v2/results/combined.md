# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `e605fe9559cae088a2060a4ed53a27c32daa4df9`.
10 tasks × 8 paired repeats (80 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 80/80 (100.0%) | 80/80 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 129.1 | 180.0 |
| Captured tool calls | 141 | 291 |
| Distinct directly read files (summed across attempts) | 45 | 45 |
| Direct source-read bytes | 15369 | 15150 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 8.1 | 9.5 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-89.9% (95% bootstrap interval [-208.6, -46.8]%)**.
Provider input token reduction: unavailable. Wall time reduction: -22.6% (95% bootstrap interval [-46.2, -3.3]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 80/80 (100.0%) | 80/80 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 8/8 | 8/8 | 707.4 | 688.8 | 2.6% |
| lh-02 (gather-launch #2) | feature | 8/8 | 8/8 | 59.8 | 87.8 | -46.8% |
| lh-03 (gather-launch #3) | feature | 8/8 | 8/8 | 97.0 | 169.2 | -74.4% |
| lh-04 (gather-launch #4) | feature | 8/8 | 8/8 | 34.1 | 106.4 | -211.9% |
| lh-05 (gather-launch #5) | feature | 8/8 | 8/8 | 34.6 | 108.4 | -213.5% |
| lh-06 (gather-launch #6) | feature | 8/8 | 8/8 | 35.1 | 72.0 | -105.3% |
| lh-07 (gather-launch #7) | feature | 8/8 | 8/8 | 31.9 | 98.6 | -208.6% |
| lh-08 (gather-launch #8) | feature | 8/8 | 8/8 | 121.8 | 204.9 | -68.3% |
| lh-09 (gather-launch #9) | feature | 8/8 | 8/8 | 40.1 | 93.3 | -132.5% |
| lh-10 (gather-launch #10) | feature | 8/8 | 8/8 | 128.8 | 170.6 | -32.5% |

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 23 | 18 | 0.0 (95% bootstrap interval [-0.1, 0.0]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

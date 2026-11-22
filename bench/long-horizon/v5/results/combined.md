# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `6f242a68c4e2461a4156089f1195d60affcbbc59`.
10 tasks × 8 paired repeats (80 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 80/80 (100.0%) | 80/80 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 167.6 | 162.3 |
| Captured tool calls | 165 | 154 |
| Distinct directly read files (summed across attempts) | 61 | 2 |
| Direct source-read bytes | 22000 | 333 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 8.3 | 7.5 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **20.1% (95% bootstrap interval [6.5, 33.6]%)**.
Provider input token reduction: unavailable. Wall time reduction: 15.5% (95% bootstrap interval [-4.1, 22.6]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 80/80 (100.0%) | 80/80 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 8/8 | 8/8 | 761.1 | 939.4 | -23.4% |
| lh-02 (gather-launch #2) | feature | 8/8 | 8/8 | 74.2 | 65.4 | 11.8% |
| lh-03 (gather-launch #3) | feature | 8/8 | 8/8 | 91.6 | 60.8 | 33.6% |
| lh-04 (gather-launch #4) | feature | 8/8 | 8/8 | 72.3 | 45.5 | 37.1% |
| lh-05 (gather-launch #5) | feature | 8/8 | 8/8 | 88.4 | 77.5 | 12.3% |
| lh-06 (gather-launch #6) | feature | 8/8 | 8/8 | 59.3 | 60.6 | -2.2% |
| lh-07 (gather-launch #7) | feature | 8/8 | 8/8 | 73.3 | 62.2 | 15.2% |
| lh-08 (gather-launch #8) | feature | 8/8 | 8/8 | 185.5 | 109.1 | 41.2% |
| lh-09 (gather-launch #9) | feature | 8/8 | 8/8 | 89.3 | 66.7 | 25.3% |
| lh-10 (gather-launch #10) | feature | 8/8 | 8/8 | 181.5 | 136.1 | 25.0% |

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 21 | 22 | 0.0 (95% bootstrap interval [-0.1, 0.0]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

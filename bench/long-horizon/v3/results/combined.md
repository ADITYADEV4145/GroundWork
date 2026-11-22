# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `abafcba361f358b61e54fc906977209e494cf07a`.
10 tasks × 8 paired repeats (80 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 80/80 (100.0%) | 80/80 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 131.1 | 164.1 |
| Captured tool calls | 142 | 225 |
| Distinct directly read files (summed across attempts) | 49 | 88 |
| Direct source-read bytes | 16936 | 31098 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 7.0 | 7.6 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-59.7% (95% bootstrap interval [-119.4, -25.0]%)**.
Provider input token reduction: unavailable. Wall time reduction: -8.4% (95% bootstrap interval [-47.9, 8.0]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 80/80 (100.0%) | 80/80 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 8/8 | 8/8 | 705.7 | 665.2 | 5.7% |
| lh-02 (gather-launch #2) | feature | 8/8 | 8/8 | 85.3 | 106.6 | -25.0% |
| lh-03 (gather-launch #3) | feature | 8/8 | 8/8 | 79.5 | 98.9 | -24.4% |
| lh-04 (gather-launch #4) | feature | 8/8 | 8/8 | 38.5 | 58.8 | -52.9% |
| lh-05 (gather-launch #5) | feature | 8/8 | 8/8 | 39.4 | 94.6 | -140.2% |
| lh-06 (gather-launch #6) | feature | 8/8 | 8/8 | 40.7 | 82.7 | -103.3% |
| lh-07 (gather-launch #7) | feature | 8/8 | 8/8 | 43.5 | 101.3 | -133.1% |
| lh-08 (gather-launch #8) | feature | 8/8 | 8/8 | 87.5 | 145.7 | -66.5% |
| lh-09 (gather-launch #9) | feature | 8/8 | 8/8 | 48.4 | 106.2 | -119.4% |
| lh-10 (gather-launch #10) | feature | 8/8 | 8/8 | 142.8 | 181.5 | -27.2% |

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 29 | 17 | 0.0 (95% bootstrap interval [-0.3, 0.0]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

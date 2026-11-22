# Groundwork benchmark: long-horizon

Devin normal; model: not exposed; pinned source: `f2d5514fd96dac166b8e57c1790949fe67e65b05`.
Capture implementation: `2183b1ba50fb8669d43a318c883f3a9ac0c8ecb4`.
10 tasks × 8 paired repeats (80 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 80/80 (100.0%) | 80/80 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 115.6 | 152.5 |
| Captured tool calls | 136 | 139 |
| Distinct directly read files (summed across attempts) | 44 | 3 |
| Direct source-read bytes | 15184 | 917 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 4.4 | 9.3 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-40.7% (95% bootstrap interval [-60.3, 12.0]%)**.
Provider input token reduction: unavailable. Wall time reduction: -153.3% (95% bootstrap interval [-209.8, -66.4]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| feature | 80/80 (100.0%) | 80/80 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| lh-01 (gather-launch #1) | feature | 8/8 | 8/8 | 657.2 | 972.0 | -47.9% |
| lh-02 (gather-launch #2) | feature | 8/8 | 8/8 | 30.7 | 54.2 | -76.5% |
| lh-03 (gather-launch #3) | feature | 8/8 | 8/8 | 75.1 | 57.9 | 22.9% |
| lh-04 (gather-launch #4) | feature | 8/8 | 8/8 | 33.6 | 29.5 | 12.0% |
| lh-05 (gather-launch #5) | feature | 8/8 | 8/8 | 31.4 | 55.6 | -76.8% |
| lh-06 (gather-launch #6) | feature | 8/8 | 8/8 | 34.0 | 49.0 | -44.0% |
| lh-07 (gather-launch #7) | feature | 8/8 | 8/8 | 32.3 | 44.4 | -37.3% |
| lh-08 (gather-launch #8) | feature | 8/8 | 8/8 | 122.0 | 104.4 | 14.5% |
| lh-09 (gather-launch #9) | feature | 8/8 | 8/8 | 38.8 | 58.7 | -51.2% |
| lh-10 (gather-launch #10) | feature | 8/8 | 8/8 | 100.5 | 99.0 | 1.5% |

| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |
| --- | ---: | ---: | ---: | ---: |
| duplicatesAdded | 24 | 20 | 0.0 (95% bootstrap interval [-0.1, 0.0]) | 10/10 |
| inventedCalls | 0 | 0 | 0.0 (95% bootstrap interval [0.0, 0.0]) | 10/10 |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

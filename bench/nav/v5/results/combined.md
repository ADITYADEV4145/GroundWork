# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `6f242a68c4e2461a4156089f1195d60affcbbc59`.
30 tasks × 8 paired repeats (240 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 240/240 (100.0%) | 240/240 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 300.7 | 305.6 |
| Captured tool calls | 505 | 492 |
| Distinct directly read files (summed across attempts) | 247 | 117 |
| Direct source-read bytes | 164548 | 63537 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.3 | 6.3 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-3.2% (95% bootstrap interval [-19.0, 4.9]%)**.
Provider input token reduction: unavailable. Wall time reduction: -11.8% (95% bootstrap interval [-36.6, -1.7]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 104/104 (100.0%) | 104/104 (100.0%) |
| trace | 88/88 (100.0%) | 88/88 (100.0%) |
| fix | 24/24 (100.0%) | 24/24 (100.0%) |
| feature | 24/24 (100.0%) | 24/24 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 8/8 | 8/8 | 1048.4 | 521.3 | 50.3% |
| gw-02 | trace | 8/8 | 8/8 | 578.2 | 429.7 | 25.7% |
| gw-03 | locate | 8/8 | 8/8 | 208.0 | 328.4 | -57.9% |
| gw-04 | trace | 8/8 | 8/8 | 463.7 | 828.9 | -78.8% |
| gw-05 | locate | 8/8 | 8/8 | 251.1 | 125.4 | 50.1% |
| gw-06 | trace | 8/8 | 8/8 | 1070.7 | 1112.0 | -3.9% |
| gw-07 | locate | 8/8 | 8/8 | 892.9 | 816.1 | 8.6% |
| gw-08 | locate | 8/8 | 8/8 | 175.4 | 870.5 | -396.4% |
| gw-09 | trace | 8/8 | 8/8 | 763.8 | 427.8 | 44.0% |
| gw-10 | locate | 8/8 | 8/8 | 334.7 | 327.3 | 2.2% |
| ts-01 | locate | 8/8 | 8/8 | 329.2 | 349.1 | -6.0% |
| ts-02 | trace | 8/8 | 8/8 | 332.9 | 322.2 | 3.2% |
| ts-03 | trace | 8/8 | 8/8 | 235.2 | 219.6 | 6.6% |
| ts-04 | locate | 8/8 | 8/8 | 80.9 | 149.8 | -85.2% |
| ts-05 | trace | 8/8 | 8/8 | 58.4 | 76.8 | -31.5% |
| ts-06 | locate | 8/8 | 8/8 | 18.8 | 18.8 | 0.0% |
| ts-07 | trace | 8/8 | 8/8 | 100.6 | 79.6 | 20.9% |
| py-01 | locate | 8/8 | 8/8 | 309.2 | 131.8 | 57.4% |
| py-02 | trace | 8/8 | 8/8 | 230.0 | 269.3 | -17.1% |
| py-03 | locate | 8/8 | 8/8 | 21.3 | 106.9 | -401.8% |
| py-04 | locate | 8/8 | 8/8 | 39.4 | 177.1 | -349.3% |
| py-05 | trace | 8/8 | 8/8 | 55.8 | 81.8 | -46.8% |
| py-06 | locate | 8/8 | 8/8 | 32.8 | 45.0 | -37.4% |
| py-07 | trace | 8/8 | 8/8 | 84.3 | 95.3 | -13.0% |
| edit-01 | fix | 8/8 | 8/8 | 175.2 | 106.7 | 39.1% |
| edit-02 | fix | 8/8 | 8/8 | 239.9 | 192.5 | 19.8% |
| edit-03 | fix | 8/8 | 8/8 | 155.7 | 188.2 | -20.9% |
| edit-04 | feature | 8/8 | 8/8 | 209.7 | 215.0 | -2.6% |
| edit-05 | feature | 8/8 | 8/8 | 402.7 | 435.2 | -8.1% |
| edit-06 | feature | 8/8 | 8/8 | 121.7 | 120.7 | 0.8% |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

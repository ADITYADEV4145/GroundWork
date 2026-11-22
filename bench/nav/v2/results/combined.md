# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `e605fe9559cae088a2060a4ed53a27c32daa4df9`.
30 tasks × 8 paired repeats (240 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 240/240 (100.0%) | 240/240 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 283.6 | 223.8 |
| Captured tool calls | 471 | 539 |
| Distinct directly read files (summed across attempts) | 224 | 171 |
| Direct source-read bytes | 147637 | 89809 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.2 | 6.6 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **0.3% (95% bootstrap interval [-25.4, 26.8]%)**.
Provider input token reduction: unavailable. Wall time reduction: -32.4% (95% bootstrap interval [-40.8, -11.5]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 104/104 (100.0%) | 104/104 (100.0%) |
| trace | 88/88 (100.0%) | 88/88 (100.0%) |
| fix | 24/24 (100.0%) | 24/24 (100.0%) |
| feature | 24/24 (100.0%) | 24/24 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 8/8 | 8/8 | 939.4 | 92.9 | 90.1% |
| gw-02 | trace | 8/8 | 8/8 | 662.0 | 223.2 | 66.3% |
| gw-03 | locate | 8/8 | 8/8 | 137.3 | 127.1 | 7.4% |
| gw-04 | trace | 8/8 | 8/8 | 476.5 | 676.1 | -41.9% |
| gw-05 | locate | 8/8 | 8/8 | 244.4 | 87.1 | 64.4% |
| gw-06 | trace | 8/8 | 8/8 | 955.1 | 686.6 | 28.1% |
| gw-07 | locate | 8/8 | 8/8 | 756.4 | 508.8 | 32.7% |
| gw-08 | locate | 8/8 | 8/8 | 205.5 | 399.8 | -94.5% |
| gw-09 | trace | 8/8 | 8/8 | 759.5 | 548.4 | 27.8% |
| gw-10 | locate | 8/8 | 8/8 | 264.4 | 95.5 | 63.9% |
| ts-01 | locate | 8/8 | 8/8 | 366.1 | 254.3 | 30.5% |
| ts-02 | trace | 8/8 | 8/8 | 332.0 | 403.6 | -21.6% |
| ts-03 | trace | 8/8 | 8/8 | 228.2 | 213.6 | 6.4% |
| ts-04 | locate | 8/8 | 8/8 | 71.5 | 104.5 | -46.2% |
| ts-05 | trace | 8/8 | 8/8 | 54.8 | 87.2 | -59.2% |
| ts-06 | locate | 8/8 | 8/8 | 18.8 | 55.6 | -196.5% |
| ts-07 | trace | 8/8 | 8/8 | 69.2 | 115.3 | -66.6% |
| py-01 | locate | 8/8 | 8/8 | 273.5 | 78.2 | 71.4% |
| py-02 | trace | 8/8 | 8/8 | 230.0 | 278.6 | -21.1% |
| py-03 | locate | 8/8 | 8/8 | 20.0 | 95.2 | -375.0% |
| py-04 | locate | 8/8 | 8/8 | 37.1 | 209.5 | -464.3% |
| py-05 | trace | 8/8 | 8/8 | 49.6 | 64.2 | -29.3% |
| py-06 | locate | 8/8 | 8/8 | 31.9 | 23.6 | 25.9% |
| py-07 | trace | 8/8 | 8/8 | 69.7 | 109.4 | -56.9% |
| edit-01 | fix | 8/8 | 8/8 | 199.6 | 119.7 | 40.0% |
| edit-02 | fix | 8/8 | 8/8 | 161.3 | 166.8 | -3.4% |
| edit-03 | fix | 8/8 | 8/8 | 186.0 | 178.7 | 3.9% |
| edit-04 | feature | 8/8 | 8/8 | 182.4 | 198.5 | -8.8% |
| edit-05 | feature | 8/8 | 8/8 | 386.7 | 402.7 | -4.1% |
| edit-06 | feature | 8/8 | 8/8 | 138.0 | 109.9 | 20.4% |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

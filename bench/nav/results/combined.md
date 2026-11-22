# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
30 tasks × 8 paired repeats (240 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 240/240 (100.0%) | 240/240 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 286.7 | 244.8 |
| Captured tool calls | 479 | 580 |
| Distinct directly read files (summed across attempts) | 217 | 194 |
| Direct source-read bytes | 137743 | 96439 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.6 | 7.4 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-2.0% (95% bootstrap interval [-25.2, 16.4]%)**.
Provider input token reduction: unavailable. Wall time reduction: -31.3% (95% bootstrap interval [-55.4, -18.9]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 104/104 (100.0%) | 104/104 (100.0%) |
| trace | 88/88 (100.0%) | 88/88 (100.0%) |
| fix | 24/24 (100.0%) | 24/24 (100.0%) |
| feature | 24/24 (100.0%) | 24/24 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 8/8 | 8/8 | 934.0 | 291.3 | 68.8% |
| gw-02 | trace | 8/8 | 8/8 | 574.0 | 217.1 | 62.2% |
| gw-03 | locate | 8/8 | 8/8 | 193.7 | 149.9 | 22.6% |
| gw-04 | trace | 8/8 | 8/8 | 492.9 | 647.2 | -31.3% |
| gw-05 | locate | 8/8 | 8/8 | 207.5 | 118.8 | 42.8% |
| gw-06 | trace | 8/8 | 8/8 | 953.9 | 661.6 | 30.6% |
| gw-07 | locate | 8/8 | 8/8 | 678.3 | 566.9 | 16.4% |
| gw-08 | locate | 8/8 | 8/8 | 237.4 | 440.0 | -85.4% |
| gw-09 | trace | 8/8 | 8/8 | 793.3 | 712.2 | 10.2% |
| gw-10 | locate | 8/8 | 8/8 | 274.6 | 146.0 | 46.8% |
| ts-01 | locate | 8/8 | 8/8 | 461.2 | 291.8 | 36.7% |
| ts-02 | trace | 8/8 | 8/8 | 341.6 | 399.7 | -17.0% |
| ts-03 | trace | 8/8 | 8/8 | 235.2 | 249.0 | -5.9% |
| ts-04 | locate | 8/8 | 8/8 | 69.8 | 143.0 | -105.0% |
| ts-05 | trace | 8/8 | 8/8 | 59.0 | 83.6 | -41.8% |
| ts-06 | locate | 8/8 | 8/8 | 18.8 | 66.2 | -253.2% |
| ts-07 | trace | 8/8 | 8/8 | 73.8 | 95.4 | -29.2% |
| py-01 | locate | 8/8 | 8/8 | 271.9 | 136.0 | 50.0% |
| py-02 | trace | 8/8 | 8/8 | 230.0 | 300.2 | -30.5% |
| py-03 | locate | 8/8 | 8/8 | 18.8 | 105.3 | -458.7% |
| py-04 | locate | 8/8 | 8/8 | 69.4 | 178.9 | -157.7% |
| py-05 | trace | 8/8 | 8/8 | 51.5 | 62.4 | -21.2% |
| py-06 | locate | 8/8 | 8/8 | 31.6 | 52.8 | -66.8% |
| py-07 | trace | 8/8 | 8/8 | 80.7 | 90.5 | -12.2% |
| edit-01 | fix | 8/8 | 8/8 | 186.8 | 94.7 | 49.3% |
| edit-02 | fix | 8/8 | 8/8 | 170.5 | 171.1 | -0.4% |
| edit-03 | fix | 8/8 | 8/8 | 160.5 | 157.9 | 1.6% |
| edit-04 | feature | 8/8 | 8/8 | 206.4 | 182.8 | 11.4% |
| edit-05 | feature | 8/8 | 8/8 | 405.0 | 419.8 | -3.7% |
| edit-06 | feature | 8/8 | 8/8 | 117.9 | 112.9 | 4.3% |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

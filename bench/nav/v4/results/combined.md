# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `ff578514d78397faffd2ac1836fb3cbd03e62ee1`.
30 tasks × 8 paired repeats (240 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 240/240 (100.0%) | 240/240 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 295.0 | 310.9 |
| Captured tool calls | 513 | 502 |
| Distinct directly read files (summed across attempts) | 254 | 119 |
| Direct source-read bytes | 156831 | 55304 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.2 | 6.5 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-0.7% (95% bootstrap interval [-47.6, 11.3]%)**.
Provider input token reduction: unavailable. Wall time reduction: -15.5% (95% bootstrap interval [-42.8, -7.4]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 104/104 (100.0%) | 104/104 (100.0%) |
| trace | 88/88 (100.0%) | 88/88 (100.0%) |
| fix | 24/24 (100.0%) | 24/24 (100.0%) |
| feature | 24/24 (100.0%) | 24/24 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 8/8 | 8/8 | 934.5 | 521.3 | 44.2% |
| gw-02 | trace | 8/8 | 8/8 | 696.3 | 442.9 | 36.4% |
| gw-03 | locate | 8/8 | 8/8 | 245.2 | 261.8 | -6.8% |
| gw-04 | trace | 8/8 | 8/8 | 468.8 | 812.0 | -73.2% |
| gw-05 | locate | 8/8 | 8/8 | 217.3 | 125.4 | 42.3% |
| gw-06 | trace | 8/8 | 8/8 | 870.6 | 865.5 | 0.6% |
| gw-07 | locate | 8/8 | 8/8 | 728.5 | 716.5 | 1.6% |
| gw-08 | locate | 8/8 | 8/8 | 168.9 | 774.4 | -358.6% |
| gw-09 | trace | 8/8 | 8/8 | 796.3 | 643.2 | 19.2% |
| gw-10 | locate | 8/8 | 8/8 | 346.0 | 279.1 | 19.3% |
| ts-01 | locate | 8/8 | 8/8 | 412.4 | 326.1 | 20.9% |
| ts-02 | trace | 8/8 | 8/8 | 332.0 | 479.5 | -44.4% |
| ts-03 | trace | 8/8 | 8/8 | 228.0 | 190.5 | 16.4% |
| ts-04 | locate | 8/8 | 8/8 | 71.6 | 239.3 | -234.4% |
| ts-05 | trace | 8/8 | 8/8 | 56.8 | 86.2 | -51.8% |
| ts-06 | locate | 8/8 | 8/8 | 18.8 | 18.8 | 0.0% |
| ts-07 | trace | 8/8 | 8/8 | 103.5 | 97.2 | 6.1% |
| py-01 | locate | 8/8 | 8/8 | 286.1 | 165.0 | 42.3% |
| py-02 | trace | 8/8 | 8/8 | 230.0 | 304.2 | -32.3% |
| py-03 | locate | 8/8 | 8/8 | 21.4 | 125.5 | -487.1% |
| py-04 | locate | 8/8 | 8/8 | 51.8 | 198.5 | -282.9% |
| py-05 | trace | 8/8 | 8/8 | 53.1 | 103.1 | -94.2% |
| py-06 | locate | 8/8 | 8/8 | 31.9 | 48.1 | -50.8% |
| py-07 | trace | 8/8 | 8/8 | 65.2 | 125.8 | -93.0% |
| edit-01 | fix | 8/8 | 8/8 | 233.8 | 113.0 | 51.7% |
| edit-02 | fix | 8/8 | 8/8 | 258.2 | 192.6 | 25.4% |
| edit-03 | fix | 8/8 | 8/8 | 163.7 | 247.6 | -51.3% |
| edit-04 | feature | 8/8 | 8/8 | 199.6 | 262.5 | -31.5% |
| edit-05 | feature | 8/8 | 8/8 | 417.5 | 423.2 | -1.3% |
| edit-06 | feature | 8/8 | 8/8 | 141.4 | 137.8 | 2.5% |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

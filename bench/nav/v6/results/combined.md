# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `2183b1ba50fb8669d43a318c883f3a9ac0c8ecb4`.
30 tasks × 8 paired repeats (240 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 240/240 (100.0%) | 240/240 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 285.6 | 259.7 |
| Captured tool calls | 475 | 463 |
| Distinct directly read files (summed across attempts) | 226 | 104 |
| Direct source-read bytes | 156085 | 41232 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.2 | 6.0 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-4.0% (95% bootstrap interval [-35.0, 7.6]%)**.
Provider input token reduction: unavailable. Wall time reduction: -10.8% (95% bootstrap interval [-31.7, -2.8]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 104/104 (100.0%) | 104/104 (100.0%) |
| trace | 88/88 (100.0%) | 88/88 (100.0%) |
| fix | 24/24 (100.0%) | 24/24 (100.0%) |
| feature | 24/24 (100.0%) | 24/24 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 8/8 | 8/8 | 964.5 | 81.3 | 91.6% |
| gw-02 | trace | 8/8 | 8/8 | 654.1 | 339.3 | 48.1% |
| gw-03 | locate | 8/8 | 8/8 | 263.1 | 164.8 | 37.4% |
| gw-04 | trace | 8/8 | 8/8 | 471.1 | 887.3 | -88.4% |
| gw-05 | locate | 8/8 | 8/8 | 242.5 | 37.0 | 84.7% |
| gw-06 | trace | 8/8 | 8/8 | 962.7 | 830.4 | 13.7% |
| gw-07 | locate | 8/8 | 8/8 | 722.8 | 484.0 | 33.0% |
| gw-08 | locate | 8/8 | 8/8 | 270.6 | 554.2 | -104.8% |
| gw-09 | trace | 8/8 | 8/8 | 661.3 | 572.8 | 13.4% |
| gw-10 | locate | 8/8 | 8/8 | 345.2 | 136.6 | 60.4% |
| ts-01 | locate | 8/8 | 8/8 | 352.9 | 332.7 | 5.7% |
| ts-02 | trace | 8/8 | 8/8 | 333.4 | 505.3 | -51.6% |
| ts-03 | trace | 8/8 | 8/8 | 214.0 | 239.2 | -11.8% |
| ts-04 | locate | 8/8 | 8/8 | 97.3 | 224.2 | -130.5% |
| ts-05 | trace | 8/8 | 8/8 | 55.8 | 59.2 | -6.2% |
| ts-06 | locate | 8/8 | 8/8 | 18.8 | 18.8 | 0.0% |
| ts-07 | trace | 8/8 | 8/8 | 66.0 | 94.7 | -43.4% |
| py-01 | locate | 8/8 | 8/8 | 247.4 | 150.8 | 39.0% |
| py-02 | trace | 8/8 | 8/8 | 225.3 | 385.4 | -71.1% |
| py-03 | locate | 8/8 | 8/8 | 20.7 | 96.7 | -366.5% |
| py-04 | locate | 8/8 | 8/8 | 52.8 | 139.6 | -164.4% |
| py-05 | trace | 8/8 | 8/8 | 54.1 | 73.1 | -35.0% |
| py-06 | locate | 8/8 | 8/8 | 34.5 | 42.8 | -24.0% |
| py-07 | trace | 8/8 | 8/8 | 69.2 | 91.9 | -32.8% |
| edit-01 | fix | 8/8 | 8/8 | 144.9 | 131.3 | 9.4% |
| edit-02 | fix | 8/8 | 8/8 | 171.1 | 168.3 | 1.6% |
| edit-03 | fix | 8/8 | 8/8 | 170.1 | 173.2 | -1.8% |
| edit-04 | feature | 8/8 | 8/8 | 168.6 | 237.7 | -41.0% |
| edit-05 | feature | 8/8 | 8/8 | 396.2 | 420.8 | -6.2% |
| edit-06 | feature | 8/8 | 8/8 | 115.7 | 116.6 | -0.8% |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

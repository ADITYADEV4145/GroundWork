# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `abafcba361f358b61e54fc906977209e494cf07a`.
30 tasks × 8 paired repeats (240 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 240/240 (100.0%) | 240/240 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 295.4 | 210.4 |
| Captured tool calls | 498 | 513 |
| Distinct directly read files (summed across attempts) | 226 | 146 |
| Direct source-read bytes | 139373 | 72042 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.2 | 6.1 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **12.5% (95% bootstrap interval [-5.0, 27.2]%)**.
Provider input token reduction: unavailable. Wall time reduction: -12.4% (95% bootstrap interval [-27.2, -3.7]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 104/104 (100.0%) | 104/104 (100.0%) |
| trace | 88/88 (100.0%) | 88/88 (100.0%) |
| fix | 24/24 (100.0%) | 24/24 (100.0%) |
| feature | 24/24 (100.0%) | 24/24 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 8/8 | 8/8 | 906.5 | 87.4 | 90.4% |
| gw-02 | trace | 8/8 | 8/8 | 516.9 | 199.4 | 61.4% |
| gw-03 | locate | 8/8 | 8/8 | 272.3 | 104.6 | 61.6% |
| gw-04 | trace | 8/8 | 8/8 | 487.7 | 542.3 | -11.2% |
| gw-05 | locate | 8/8 | 8/8 | 202.1 | 41.2 | 79.6% |
| gw-06 | trace | 8/8 | 8/8 | 905.1 | 634.3 | 29.9% |
| gw-07 | locate | 8/8 | 8/8 | 905.5 | 460.0 | 49.2% |
| gw-08 | locate | 8/8 | 8/8 | 244.8 | 484.6 | -98.0% |
| gw-09 | trace | 8/8 | 8/8 | 608.1 | 485.3 | 20.2% |
| gw-10 | locate | 8/8 | 8/8 | 346.9 | 118.6 | 65.8% |
| ts-01 | locate | 8/8 | 8/8 | 462.0 | 324.0 | 29.9% |
| ts-02 | trace | 8/8 | 8/8 | 332.0 | 304.0 | 8.4% |
| ts-03 | trace | 8/8 | 8/8 | 228.0 | 190.4 | 16.5% |
| ts-04 | locate | 8/8 | 8/8 | 71.3 | 80.1 | -12.3% |
| ts-05 | trace | 8/8 | 8/8 | 55.4 | 86.1 | -55.3% |
| ts-06 | locate | 8/8 | 8/8 | 18.8 | 18.8 | 0.0% |
| ts-07 | trace | 8/8 | 8/8 | 95.3 | 99.7 | -4.7% |
| py-01 | locate | 8/8 | 8/8 | 270.9 | 204.7 | 24.4% |
| py-02 | trace | 8/8 | 8/8 | 230.0 | 246.1 | -7.0% |
| py-03 | locate | 8/8 | 8/8 | 18.8 | 86.6 | -359.5% |
| py-04 | locate | 8/8 | 8/8 | 68.0 | 162.3 | -138.7% |
| py-05 | trace | 8/8 | 8/8 | 55.6 | 58.6 | -5.3% |
| py-06 | locate | 8/8 | 8/8 | 31.6 | 36.3 | -14.7% |
| py-07 | trace | 8/8 | 8/8 | 75.0 | 89.5 | -19.3% |
| edit-01 | fix | 8/8 | 8/8 | 202.8 | 102.5 | 49.4% |
| edit-02 | fix | 8/8 | 8/8 | 242.8 | 159.4 | 34.3% |
| edit-03 | fix | 8/8 | 8/8 | 174.3 | 164.4 | 5.6% |
| edit-04 | feature | 8/8 | 8/8 | 245.3 | 194.3 | 20.8% |
| edit-05 | feature | 8/8 | 8/8 | 428.7 | 416.1 | 2.9% |
| edit-06 | feature | 8/8 | 8/8 | 161.2 | 129.3 | 19.7% |

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

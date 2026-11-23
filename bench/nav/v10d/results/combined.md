# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `e3bdc7401daf7264b242b32a2d7bc4de09178f69`.
30 tasks × 16 paired repeats (480 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 480/480 (100.0%) | 480/480 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 270.0 | 299.6 |
| Captured tool calls | 914 | 842 |
| Distinct directly read files (summed across attempts) | 415 | 160 |
| Direct source-read bytes | 277863 | 63945 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.3 | 5.4 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-14.5% (95% bootstrap interval [-46.7, -1.4]%)**.
Provider input token reduction: unavailable. Wall time reduction: -2.0% (95% bootstrap interval [-13.8, 3.0]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 208/208 (100.0%) | 208/208 (100.0%) |
| trace | 176/176 (100.0%) | 176/176 (100.0%) |
| fix | 48/48 (100.0%) | 48/48 (100.0%) |
| feature | 48/48 (100.0%) | 48/48 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 16/16 | 16/16 | 797.2 | 452.2 | 43.3% |
| gw-02 | trace | 16/16 | 16/16 | 542.3 | 599.7 | -10.6% |
| gw-03 | locate | 16/16 | 16/16 | 220.3 | 284.5 | -29.1% |
| gw-04 | trace | 16/16 | 16/16 | 487.3 | 615.0 | -26.2% |
| gw-05 | locate | 16/16 | 16/16 | 133.7 | 116.4 | 12.9% |
| gw-06 | trace | 16/16 | 16/16 | 923.5 | 867.6 | 6.1% |
| gw-07 | locate | 16/16 | 16/16 | 828.5 | 607.2 | 26.7% |
| gw-08 | locate | 16/16 | 16/16 | 219.1 | 532.9 | -143.2% |
| gw-09 | trace | 16/16 | 16/16 | 704.6 | 853.1 | -21.1% |
| gw-10 | locate | 16/16 | 16/16 | 245.1 | 237.9 | 2.9% |
| ts-01 | locate | 16/16 | 16/16 | 344.7 | 353.7 | -2.6% |
| ts-02 | trace | 16/16 | 16/16 | 317.8 | 474.8 | -49.4% |
| ts-03 | trace | 16/16 | 16/16 | 213.9 | 313.9 | -46.7% |
| ts-04 | locate | 16/16 | 16/16 | 56.5 | 148.4 | -162.5% |
| ts-05 | trace | 16/16 | 16/16 | 59.0 | 95.5 | -61.9% |
| ts-06 | locate | 16/16 | 16/16 | 18.8 | 18.8 | -0.2% |
| ts-07 | trace | 16/16 | 16/16 | 69.0 | 126.5 | -83.3% |
| py-01 | locate | 16/16 | 16/16 | 279.4 | 223.9 | 19.9% |
| py-02 | trace | 16/16 | 16/16 | 234.7 | 335.0 | -42.7% |
| py-03 | locate | 16/16 | 16/16 | 17.5 | 136.6 | -681.3% |
| py-04 | locate | 16/16 | 16/16 | 80.1 | 183.9 | -129.6% |
| py-05 | trace | 16/16 | 16/16 | 49.9 | 88.3 | -77.1% |
| py-06 | locate | 16/16 | 16/16 | 31.3 | 33.6 | -7.2% |
| py-07 | trace | 16/16 | 16/16 | 62.0 | 133.7 | -115.5% |
| edit-01 | fix | 16/16 | 16/16 | 136.8 | 88.2 | 35.6% |
| edit-02 | fix | 16/16 | 16/16 | 186.4 | 154.8 | 16.9% |
| edit-03 | fix | 16/16 | 16/16 | 153.8 | 173.0 | -12.5% |
| edit-04 | feature | 16/16 | 16/16 | 188.6 | 220.0 | -16.6% |
| edit-05 | feature | 16/16 | 16/16 | 373.7 | 398.4 | -6.6% |
| edit-06 | feature | 16/16 | 16/16 | 124.6 | 119.4 | 4.2% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 5668.1 | 5959.9 | -5.1% (95% bootstrap interval [-13.1, 2.0]%) |
| emittedBytesPerSession | 32401.6 | 35947.6 | -10.9% (95% bootstrap interval [-20.1, -2.0]%) |
| toolSideMsPerSession | 1315.7 | 7328.1 | -457.0% (95% bootstrap interval [-531.1, -390.9]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -14.330537800573628%.

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

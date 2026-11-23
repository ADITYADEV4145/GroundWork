# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `e3bdc7401daf7264b242b32a2d7bc4de09178f69`.
30 tasks × 16 paired repeats (480 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 480/480 (100.0%) | 480/480 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 270.0 | 275.2 |
| Captured tool calls | 914 | 805 |
| Distinct directly read files (summed across attempts) | 415 | 183 |
| Direct source-read bytes | 277863 | 68590 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.3 | 5.0 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-0.5% (95% bootstrap interval [-28.4, 5.6]%)**.
Provider input token reduction: unavailable. Wall time reduction: 0.4% (95% bootstrap interval [-7.3, 15.9]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 208/208 (100.0%) | 208/208 (100.0%) |
| trace | 176/176 (100.0%) | 176/176 (100.0%) |
| fix | 48/48 (100.0%) | 48/48 (100.0%) |
| feature | 48/48 (100.0%) | 48/48 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 16/16 | 16/16 | 797.2 | 501.5 | 37.1% |
| gw-02 | trace | 16/16 | 16/16 | 542.3 | 479.2 | 11.6% |
| gw-03 | locate | 16/16 | 16/16 | 220.3 | 359.5 | -63.2% |
| gw-04 | trace | 16/16 | 16/16 | 487.3 | 646.2 | -32.6% |
| gw-05 | locate | 16/16 | 16/16 | 133.7 | 131.3 | 1.8% |
| gw-06 | trace | 16/16 | 16/16 | 923.5 | 918.6 | 0.5% |
| gw-07 | locate | 16/16 | 16/16 | 828.5 | 734.8 | 11.3% |
| gw-08 | locate | 16/16 | 16/16 | 219.1 | 576.7 | -163.2% |
| gw-09 | trace | 16/16 | 16/16 | 704.6 | 469.6 | 33.3% |
| gw-10 | locate | 16/16 | 16/16 | 245.1 | 245.3 | -0.1% |
| ts-01 | locate | 16/16 | 16/16 | 344.7 | 347.3 | -0.8% |
| ts-02 | trace | 16/16 | 16/16 | 317.8 | 287.9 | 9.4% |
| ts-03 | trace | 16/16 | 16/16 | 213.9 | 236.5 | -10.6% |
| ts-04 | locate | 16/16 | 16/16 | 56.5 | 140.9 | -149.3% |
| ts-05 | trace | 16/16 | 16/16 | 59.0 | 80.4 | -36.3% |
| ts-06 | locate | 16/16 | 16/16 | 18.8 | 18.8 | -0.2% |
| ts-07 | trace | 16/16 | 16/16 | 69.0 | 95.1 | -37.8% |
| py-01 | locate | 16/16 | 16/16 | 279.4 | 213.7 | 23.5% |
| py-02 | trace | 16/16 | 16/16 | 234.7 | 189.5 | 19.2% |
| py-03 | locate | 16/16 | 16/16 | 17.5 | 104.7 | -498.7% |
| py-04 | locate | 16/16 | 16/16 | 80.1 | 166.0 | -107.1% |
| py-05 | trace | 16/16 | 16/16 | 49.9 | 79.0 | -58.3% |
| py-06 | locate | 16/16 | 16/16 | 31.3 | 38.9 | -24.3% |
| py-07 | trace | 16/16 | 16/16 | 62.0 | 87.0 | -40.2% |
| edit-01 | fix | 16/16 | 16/16 | 136.8 | 88.9 | 35.0% |
| edit-02 | fix | 16/16 | 16/16 | 186.4 | 148.8 | 20.2% |
| edit-03 | fix | 16/16 | 16/16 | 153.8 | 184.2 | -19.8% |
| edit-04 | feature | 16/16 | 16/16 | 188.6 | 189.0 | -0.2% |
| edit-05 | feature | 16/16 | 16/16 | 373.7 | 401.4 | -7.4% |
| edit-06 | feature | 16/16 | 16/16 | 124.6 | 96.6 | 22.5% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 5668.1 | 5445.7 | 3.9% (95% bootstrap interval [-4.4, 11.3]%) |
| emittedBytesPerSession | 32401.6 | 33028.2 | -1.9% (95% bootstrap interval [-8.3, 4.2]%) |
| toolSideMsPerSession | 1315.7 | 7445.8 | -465.9% (95% bootstrap interval [-540.0, -405.3]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -5.603748732532576%.

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

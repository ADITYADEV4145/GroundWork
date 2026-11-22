# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `243bb549e352ee4a63e968230055cda0c165bbe5`.
30 tasks × 16 paired repeats (480 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 480/480 (100.0%) | 480/480 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 290.4 | 275.4 |
| Captured tool calls | 967 | 1000 |
| Distinct directly read files (summed across attempts) | 451 | 268 |
| Direct source-read bytes | 321157 | 134996 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.0 | 5.9 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-1.3% (95% bootstrap interval [-23.2, 9.4]%)**.
Provider input token reduction: unavailable. Wall time reduction: -15.7% (95% bootstrap interval [-29.8, -4.0]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 208/208 (100.0%) | 208/208 (100.0%) |
| trace | 176/176 (100.0%) | 176/176 (100.0%) |
| fix | 48/48 (100.0%) | 48/48 (100.0%) |
| feature | 48/48 (100.0%) | 48/48 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 16/16 | 16/16 | 1138.4 | 526.0 | 53.8% |
| gw-02 | trace | 16/16 | 16/16 | 545.6 | 382.7 | 29.9% |
| gw-03 | locate | 16/16 | 16/16 | 164.2 | 174.1 | -6.0% |
| gw-04 | trace | 16/16 | 16/16 | 479.1 | 662.7 | -38.3% |
| gw-05 | locate | 16/16 | 16/16 | 232.0 | 86.5 | 62.7% |
| gw-06 | trace | 16/16 | 16/16 | 998.2 | 750.7 | 24.8% |
| gw-07 | locate | 16/16 | 16/16 | 747.4 | 625.9 | 16.3% |
| gw-08 | locate | 16/16 | 16/16 | 201.2 | 747.7 | -271.7% |
| gw-09 | trace | 16/16 | 16/16 | 718.5 | 647.1 | 9.9% |
| gw-10 | locate | 16/16 | 16/16 | 319.6 | 291.3 | 8.8% |
| ts-01 | locate | 16/16 | 16/16 | 351.8 | 361.4 | -2.7% |
| ts-02 | trace | 16/16 | 16/16 | 332.0 | 333.2 | -0.4% |
| ts-03 | trace | 16/16 | 16/16 | 225.3 | 230.3 | -2.2% |
| ts-04 | locate | 16/16 | 16/16 | 94.3 | 188.8 | -100.2% |
| ts-05 | trace | 16/16 | 16/16 | 56.8 | 71.7 | -26.1% |
| ts-06 | locate | 16/16 | 16/16 | 18.8 | 18.8 | -0.3% |
| ts-07 | trace | 16/16 | 16/16 | 79.8 | 106.4 | -33.3% |
| py-01 | locate | 16/16 | 16/16 | 327.5 | 176.8 | 46.0% |
| py-02 | trace | 16/16 | 16/16 | 230.0 | 276.8 | -20.3% |
| py-03 | locate | 16/16 | 16/16 | 17.5 | 105.1 | -499.1% |
| py-04 | locate | 16/16 | 16/16 | 38.5 | 166.4 | -332.5% |
| py-05 | trace | 16/16 | 16/16 | 53.9 | 81.5 | -51.1% |
| py-06 | locate | 16/16 | 16/16 | 31.5 | 43.5 | -38.2% |
| py-07 | trace | 16/16 | 16/16 | 66.0 | 94.5 | -43.2% |
| edit-01 | fix | 16/16 | 16/16 | 175.5 | 88.8 | 49.4% |
| edit-02 | fix | 16/16 | 16/16 | 184.2 | 150.8 | 18.1% |
| edit-03 | fix | 16/16 | 16/16 | 168.9 | 162.4 | 3.8% |
| edit-04 | feature | 16/16 | 16/16 | 188.3 | 220.0 | -16.8% |
| edit-05 | feature | 16/16 | 16/16 | 390.8 | 388.5 | 0.6% |
| edit-06 | feature | 16/16 | 16/16 | 136.5 | 101.8 | 25.4% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 5349.6 | 6321.2 | -18.2% (95% bootstrap interval [-27.1, -10.4]%) |
| emittedBytesPerSession | 34848.3 | 33048.7 | 5.2% (95% bootstrap interval [-3.8, 13.2]%) |
| toolSideMsPerSession | 1604.5 | 8739.2 | -444.7% (95% bootstrap interval [-501.5, -395.3]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -28.345771334999604%.

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `01b142647e338ce557ef85bb7ef6c15e0c4f9257`.
30 tasks × 16 paired repeats (480 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 480/480 (100.0%) | 480/480 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 278.2 | 291.0 |
| Captured tool calls | 969 | 960 |
| Distinct directly read files (summed across attempts) | 463 | 246 |
| Direct source-read bytes | 305809 | 125608 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.0 | 5.9 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-7.2% (95% bootstrap interval [-19.4, 2.1]%)**.
Provider input token reduction: unavailable. Wall time reduction: -13.0% (95% bootstrap interval [-32.9, -1.6]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 208/208 (100.0%) | 208/208 (100.0%) |
| trace | 176/176 (100.0%) | 176/176 (100.0%) |
| fix | 48/48 (100.0%) | 48/48 (100.0%) |
| feature | 48/48 (100.0%) | 48/48 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 16/16 | 16/16 | 944.1 | 457.3 | 51.6% |
| gw-02 | trace | 16/16 | 16/16 | 626.0 | 372.7 | 40.5% |
| gw-03 | locate | 16/16 | 16/16 | 178.5 | 281.8 | -57.8% |
| gw-04 | trace | 16/16 | 16/16 | 487.3 | 720.5 | -47.9% |
| gw-05 | locate | 16/16 | 16/16 | 235.9 | 81.1 | 65.6% |
| gw-06 | trace | 16/16 | 16/16 | 805.7 | 956.1 | -18.7% |
| gw-07 | locate | 16/16 | 16/16 | 776.5 | 764.0 | 1.6% |
| gw-08 | locate | 16/16 | 16/16 | 207.7 | 875.4 | -321.5% |
| gw-09 | trace | 16/16 | 16/16 | 766.8 | 567.3 | 26.0% |
| gw-10 | locate | 16/16 | 16/16 | 270.1 | 306.4 | -13.4% |
| ts-01 | locate | 16/16 | 16/16 | 324.8 | 353.2 | -8.7% |
| ts-02 | trace | 16/16 | 16/16 | 332.0 | 353.8 | -6.6% |
| ts-03 | trace | 16/16 | 16/16 | 219.1 | 257.0 | -17.3% |
| ts-04 | locate | 16/16 | 16/16 | 74.0 | 144.0 | -94.7% |
| ts-05 | trace | 16/16 | 16/16 | 66.8 | 66.1 | 1.1% |
| ts-06 | locate | 16/16 | 16/16 | 21.7 | 21.0 | 3.2% |
| ts-07 | trace | 16/16 | 16/16 | 83.6 | 90.2 | -7.9% |
| py-01 | locate | 16/16 | 16/16 | 330.6 | 164.2 | 50.3% |
| py-02 | trace | 16/16 | 16/16 | 230.0 | 289.3 | -25.8% |
| py-03 | locate | 16/16 | 16/16 | 17.5 | 106.1 | -505.9% |
| py-04 | locate | 16/16 | 16/16 | 49.7 | 181.2 | -264.5% |
| py-05 | trace | 16/16 | 16/16 | 53.5 | 64.3 | -20.2% |
| py-06 | locate | 16/16 | 16/16 | 29.8 | 42.7 | -43.3% |
| py-07 | trace | 16/16 | 16/16 | 66.2 | 106.8 | -61.4% |
| edit-01 | fix | 16/16 | 16/16 | 120.3 | 98.4 | 18.2% |
| edit-02 | fix | 16/16 | 16/16 | 199.1 | 168.6 | 15.3% |
| edit-03 | fix | 16/16 | 16/16 | 159.2 | 166.7 | -4.7% |
| edit-04 | feature | 16/16 | 16/16 | 187.0 | 182.3 | 2.5% |
| edit-05 | feature | 16/16 | 16/16 | 367.5 | 388.4 | -5.7% |
| edit-06 | feature | 16/16 | 16/16 | 114.9 | 101.7 | 11.5% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 5341.1 | 6350.5 | -18.9% (95% bootstrap interval [-26.8, -11.2]%) |
| emittedBytesPerSession | 33383.6 | 34914.3 | -4.6% (95% bootstrap interval [-12.1, 2.3]%) |
| toolSideMsPerSession | 1599.9 | 10774.7 | -573.5% (95% bootstrap interval [-646.7, -503.6]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -27.8523097094425%.

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `36f54a0845fe2bf4184549cf5cef8f216a8957ab`.
30 tasks × 16 paired repeats (480 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 480/480 (100.0%) | 480/480 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 272.3 | 298.9 |
| Captured tool calls | 965 | 835 |
| Distinct directly read files (summed across attempts) | 447 | 196 |
| Direct source-read bytes | 285277 | 82800 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.3 | 5.6 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-10.4% (95% bootstrap interval [-29.2, -0.0]%)**.
Provider input token reduction: unavailable. Wall time reduction: -4.0% (95% bootstrap interval [-18.3, 2.2]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 208/208 (100.0%) | 208/208 (100.0%) |
| trace | 176/176 (100.0%) | 176/176 (100.0%) |
| fix | 48/48 (100.0%) | 48/48 (100.0%) |
| feature | 48/48 (100.0%) | 48/48 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 16/16 | 16/16 | 880.1 | 541.7 | 38.5% |
| gw-02 | trace | 16/16 | 16/16 | 560.5 | 559.9 | 0.1% |
| gw-03 | locate | 16/16 | 16/16 | 167.8 | 282.1 | -68.2% |
| gw-04 | trace | 16/16 | 16/16 | 481.7 | 651.4 | -35.2% |
| gw-05 | locate | 16/16 | 16/16 | 212.4 | 129.9 | 38.9% |
| gw-06 | trace | 16/16 | 16/16 | 804.3 | 865.3 | -7.6% |
| gw-07 | locate | 16/16 | 16/16 | 752.9 | 648.7 | 13.8% |
| gw-08 | locate | 16/16 | 16/16 | 212.8 | 505.4 | -137.5% |
| gw-09 | trace | 16/16 | 16/16 | 708.7 | 809.0 | -14.1% |
| gw-10 | locate | 16/16 | 16/16 | 299.8 | 250.0 | 16.6% |
| ts-01 | locate | 16/16 | 16/16 | 380.7 | 352.3 | 7.5% |
| ts-02 | trace | 16/16 | 16/16 | 332.0 | 437.8 | -31.9% |
| ts-03 | trace | 16/16 | 16/16 | 221.2 | 258.3 | -16.7% |
| ts-04 | locate | 16/16 | 16/16 | 71.0 | 147.8 | -108.3% |
| ts-05 | trace | 16/16 | 16/16 | 63.8 | 104.0 | -63.0% |
| ts-06 | locate | 16/16 | 16/16 | 18.8 | 18.8 | -0.2% |
| ts-07 | trace | 16/16 | 16/16 | 81.9 | 82.4 | -0.6% |
| py-01 | locate | 16/16 | 16/16 | 284.9 | 242.0 | 15.0% |
| py-02 | trace | 16/16 | 16/16 | 226.1 | 250.2 | -10.6% |
| py-03 | locate | 16/16 | 16/16 | 17.5 | 135.8 | -676.8% |
| py-04 | locate | 16/16 | 16/16 | 48.1 | 200.2 | -315.9% |
| py-05 | trace | 16/16 | 16/16 | 55.2 | 108.2 | -96.1% |
| py-06 | locate | 16/16 | 16/16 | 31.5 | 39.8 | -26.4% |
| py-07 | trace | 16/16 | 16/16 | 74.7 | 152.2 | -103.9% |
| edit-01 | fix | 16/16 | 16/16 | 149.8 | 104.4 | 30.3% |
| edit-02 | fix | 16/16 | 16/16 | 180.7 | 153.8 | 14.9% |
| edit-03 | fix | 16/16 | 16/16 | 160.2 | 202.6 | -26.4% |
| edit-04 | feature | 16/16 | 16/16 | 196.7 | 212.0 | -7.8% |
| edit-05 | feature | 16/16 | 16/16 | 372.0 | 409.5 | -10.1% |
| edit-06 | feature | 16/16 | 16/16 | 122.4 | 110.3 | 9.9% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 5701.7 | 6005.2 | -5.3% (95% bootstrap interval [-13.9, 2.5]%) |
| emittedBytesPerSession | 32680.5 | 35862.3 | -9.7% (95% bootstrap interval [-17.8, -2.1]%) |
| toolSideMsPerSession | 1501.7 | 7895.5 | -425.8% (95% bootstrap interval [-545.3, -330.1]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -15.086952015832766%.

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

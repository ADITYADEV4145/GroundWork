# Groundwork benchmark: nav

Devin normal; model: not exposed; pinned source: `e0709ce62f2e8766080ec753c90a46fc96620610`.
Capture implementation: `36f54a0845fe2bf4184549cf5cef8f216a8957ab`.
30 tasks × 16 paired repeats (480 attempts per arm).

| Measure | Baseline | Groundwork |
| --- | ---: | ---: |
| Success | 480/480 (100.0%) | 480/480 (100.0%) |
| Estimated tool-output tokens (bytes / 4), mean per attempt | 272.3 | 287.2 |
| Captured tool calls | 965 | 829 |
| Distinct directly read files (summed across attempts) | 447 | 183 |
| Direct source-read bytes | 285277 | 78793 |
| Guarded reads blocked | 0 | 0 |
| Wall time, mean per attempt (s) | 5.3 | 5.3 |
| Provider input tokens per attempt | unavailable | unavailable |
| Provider output tokens per attempt | unavailable | unavailable |

Estimated tool-output token reduction (median of paired task reductions): **-3.8% (95% bootstrap interval [-23.1, 8.5]%)**.
Provider input token reduction: unavailable. Wall time reduction: -0.5% (95% bootstrap interval [-11.7, 6.1]%).
Success delta (Groundwork minus baseline, median per task): 0.0 pp (95% bootstrap interval [0.0, 0.0] pp).

| Task category | Baseline success | Groundwork success |
| --- | ---: | ---: |
| locate | 208/208 (100.0%) | 208/208 (100.0%) |
| trace | 176/176 (100.0%) | 176/176 (100.0%) |
| fix | 48/48 (100.0%) | 48/48 (100.0%) |
| feature | 48/48 (100.0%) | 48/48 (100.0%) |

| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| gw-01 | locate | 16/16 | 16/16 | 880.1 | 501.6 | 43.0% |
| gw-02 | trace | 16/16 | 16/16 | 560.5 | 512.9 | 8.5% |
| gw-03 | locate | 16/16 | 16/16 | 167.8 | 359.5 | -114.3% |
| gw-04 | trace | 16/16 | 16/16 | 481.7 | 628.8 | -30.6% |
| gw-05 | locate | 16/16 | 16/16 | 212.4 | 131.3 | 38.2% |
| gw-06 | trace | 16/16 | 16/16 | 804.3 | 998.5 | -24.1% |
| gw-07 | locate | 16/16 | 16/16 | 752.9 | 766.9 | -1.9% |
| gw-08 | locate | 16/16 | 16/16 | 212.8 | 521.1 | -144.9% |
| gw-09 | trace | 16/16 | 16/16 | 708.7 | 589.0 | 16.9% |
| gw-10 | locate | 16/16 | 16/16 | 299.8 | 240.2 | 19.9% |
| ts-01 | locate | 16/16 | 16/16 | 380.7 | 356.9 | 6.2% |
| ts-02 | trace | 16/16 | 16/16 | 332.0 | 304.6 | 8.3% |
| ts-03 | trace | 16/16 | 16/16 | 221.2 | 231.4 | -4.6% |
| ts-04 | locate | 16/16 | 16/16 | 71.0 | 133.1 | -87.6% |
| ts-05 | trace | 16/16 | 16/16 | 63.8 | 76.9 | -20.4% |
| ts-06 | locate | 16/16 | 16/16 | 18.8 | 18.8 | 0.0% |
| ts-07 | trace | 16/16 | 16/16 | 81.9 | 93.0 | -13.6% |
| py-01 | locate | 16/16 | 16/16 | 284.9 | 215.7 | 24.3% |
| py-02 | trace | 16/16 | 16/16 | 226.1 | 185.0 | 18.2% |
| py-03 | locate | 16/16 | 16/16 | 17.5 | 134.2 | -667.6% |
| py-04 | locate | 16/16 | 16/16 | 48.1 | 198.5 | -312.4% |
| py-05 | trace | 16/16 | 16/16 | 55.2 | 67.0 | -21.4% |
| py-06 | locate | 16/16 | 16/16 | 31.5 | 48.1 | -52.8% |
| py-07 | trace | 16/16 | 16/16 | 74.7 | 91.9 | -23.1% |
| edit-01 | fix | 16/16 | 16/16 | 149.8 | 118.7 | 20.8% |
| edit-02 | fix | 16/16 | 16/16 | 180.7 | 150.2 | 16.9% |
| edit-03 | fix | 16/16 | 16/16 | 160.2 | 209.0 | -30.4% |
| edit-04 | feature | 16/16 | 16/16 | 196.7 | 247.8 | -26.0% |
| edit-05 | feature | 16/16 | 16/16 | 372.0 | 382.9 | -2.9% |
| edit-06 | feature | 16/16 | 16/16 | 122.4 | 101.5 | 17.1% |

## Session primary estimands

Clock basis: recorded-session. Independent whole-session bootstrap; task-window measures above are secondary.

| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |
| --- | ---: | ---: | --- |
| elapsedMsPerTask | 5701.7 | 5782.4 | -1.4% (95% bootstrap interval [-9.8, 6.5]%) |
| emittedBytesPerSession | 32680.5 | 34459.4 | -5.4% (95% bootstrap interval [-13.6, 1.8]%) |
| toolSideMsPerSession | 1501.7 | 7336.7 | -388.6% (95% bootstrap interval [-475.3, -313.3]%) |

Success guardrail (no category drop): met.
Multiplicity-adjusted latency lower bound (97.5% per suite): -10.903368926685864%.

Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.
Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.
Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.

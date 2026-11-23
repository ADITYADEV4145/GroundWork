# Exploratory 120 s reruns of timed-out cases

**Not a gate result. Decides nothing, and supports no speed, token, cost or competitor claim.** Announced in `../PREREGISTRATION-v2.md`: the cases that hit the 4,000 ms timeout were run once more with a 120,000 ms budget, to publish how long those checks take. Times are wall-clock for one check, single run each, on the machine in `../results-v2/RESULTS.md`.

| Language | Cases rerun | Checked | Blocked | Fastest | Median | Slowest | Within 4 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rust, rust-analyzer clean cases (timed out in the second run) | 20 | 20 | 0 | 3.5 s | 7.9 s | 23.2 s | 2 |
| C#, Polly clean cases (timed out in the first run) | 28 | 28 | 0 | 4.1 s | 5.6 s | 12.2 s | 0 |
| C#, Serilog clean cases (timed out in the first run) | 4 | 4 | 0 | 3.9 s | 4.3 s | 5.5 s | 1 |

The 2 rust-analyzer seeds that timed out in the second run were caught in 1.4 s and 3.2 s.

- Rust rows use the second run's checker; the C# checker is the first run's, unchanged.
- C#: the gate machine had only .NET SDK 11.0.100. A first attempt at these 32 cases checked 5 and reported "A compatible .NET SDK was not found" for the other 27, whose `global.json` pins an 8.0, 9.0 or 10.0 SDK. SDKs 8.0.428, 9.0.321 and 10.0.403 were then installed and all 32 were run again; `csharp.exploratory.json` is that second attempt. The first attempt's file is not kept.
- So on a machine without the pinned SDK these cases are unchecked for a different reason than time, and with it they take longer than the budget.

Raw rows: `rust.exploratory.json`, `csharp.exploratory.json`.

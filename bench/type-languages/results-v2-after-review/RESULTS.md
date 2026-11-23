# Compiled-language type-checking gate results

**Deterministic tool-level evaluation, NOT an agent run.** Nothing here supports a speed, token, cost or competitor claim.

Preregistered manifest SHA256: `5e8e9f2c073c70627198e801305f5e5893e065f32b32d8d5094abf575925a590`. Checker commit: `e0892e4509b22adf9eb9056fe6d3676b5333e3b4`.

| Language | Status | Seeded caught, grounding only (A) | Seeded caught, with types (B) | Recall B | Seeded timed out | Clean cases (checked) | Blocks on clean A / B | Stop type-check p50 / p95 ms | `gw init` ms (3 runs) | Latency repo lines | Complete |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Go | **PASS** | 0/35 | 32/35 | 91.4% | 0 | 100 (100) | 0 / 0 | 241.141 / 292.902 | 2590, 2813, 3099 | 235173 (hugo) | yes |

## Preregistered rules

| Language | Seeded >= 30 and recall >= 85% | Clean cases >= 100 and blocks <= 1 per 100 | Clean cases checked >= 90% | Stop type-check p95 <= 4000 ms | `gw init` < 60 s | Latency repo >= 100000 lines |
| --- | --- | --- | --- | --- | --- | --- |
| Go | PASS | PASS | PASS | PASS | PASS | PASS |

## Seeded errors by operator (caught by B / total)

| Language | invented-function | invented-method | wrong-arity | wrong-import |
| --- | ---: | ---: | ---: | ---: |
| Go | 8/10 | 9/10 | 10/10 | 5/5 |

## Missed seeded errors

- Go `hugo-invented-function-2` `magefile.go:89`: `if err := runWithGw(flagEnv(), goexe, "generate", path.Join(packageName, pkg)); err != nil {`
- Go `hugo-invented-function-4` `common/loggers/logger.go:197`: `StdErrGw() io.Writer`
- Go `hugo-invented-method-2` `tpl/tplimpl/templatestore.go:1429`: `hyphenIdx := strings.IndexGw(name, "-")`

## Blocking findings on designated-clean commits (B)

None.

## Timeouts, unchecked cases and harness errors

None.

## Environment

- node: v24.22.2
- platform: linux x64, 8 CPUs
- go: go version go1.26.9 linux/amd64
- javac: javac 17.0.20.1
- cargo: cargo 1.99.1 (5f94df478 2026-08-27)
- dotnet: 11.0.100

Raw rows: `<language>.cases.json` and `<language>.latency.json`. Protocol and limitations: `../PREREGISTRATION.md`.

## Notes added after the run

Written by hand; the tables and lists above are the runner's output, unchanged. The protocol is `../PREREGISTRATION-v2.md` (the line above names the first run's file).

- This is the Go rerun set measured again after the review fixes to the Go checker (host build and target sizes under cross-compilation, a package also checked without its test files, unchecked when an imported cached dependency imports a package checked from source, caches keyed by build target). An earlier measurement between review rounds, at `b3f52cb`, also passed every rule and is in the branch history. `../results-v2/RESULTS.md` was measured before those fixes at `bb73e84` and stands as published. Go passes every rule in both.
- Like `../results-v2/`, this set is not held out. The held-out set after the fixes is `../results-v2-heldout-after-review/RESULTS.md`.
- Rust and C# were not touched by the fixes and not rerun.

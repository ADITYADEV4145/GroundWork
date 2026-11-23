# Compiled-language type-checking gate results

**Deterministic tool-level evaluation, NOT an agent run.** Nothing here supports a speed, token, cost or competitor claim.

Preregistered manifest SHA256: `5e8e9f2c073c70627198e801305f5e5893e065f32b32d8d5094abf575925a590`. Checker commit: `bb73e84f51e6f692133c7872aea8bd01d6431e2f`.

| Language | Status | Seeded caught, grounding only (A) | Seeded caught, with types (B) | Recall B | Seeded timed out | Clean cases (checked) | Blocks on clean A / B | Stop type-check p50 / p95 ms | `gw init` ms (3 runs) | Latency repo lines | Complete |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Go | **PASS** | 0/35 | 32/35 | 91.4% | 0 | 100 (100) | 0 / 0 | 276.421 / 327.275 | 3264, 3052, 2721 | 235173 (hugo) | yes |
| Rust | **FAIL** | 0/40 | 38/40 | 95.0% | 2 | 100 (80) | 0 / 0 | 117.679 / 248.584 | 6946, 6886, 7133 | 597947 (rust-analyzer) | yes |

## Preregistered rules

| Language | Seeded >= 30 and recall >= 85% | Clean cases >= 100 and blocks <= 1 per 100 | Clean cases checked >= 90% | Stop type-check p95 <= 4000 ms | `gw init` < 60 s | Latency repo >= 100000 lines |
| --- | --- | --- | --- | --- | --- | --- |
| Go | PASS | PASS | PASS | PASS | PASS | PASS |
| Rust | PASS | PASS | FAIL | PASS | PASS | PASS |

## Seeded errors by operator (caught by B / total)

| Language | invented-function | invented-method | wrong-arity | wrong-import |
| --- | ---: | ---: | ---: | ---: |
| Go | 8/10 | 9/10 | 10/10 | 5/5 |
| Rust | 9/10 | 10/10 | 10/10 | 9/10 |

## Missed seeded errors

- Go `hugo-invented-function-2` `magefile.go:89`: `if err := runWithGw(flagEnv(), goexe, "generate", path.Join(packageName, pkg)); err != nil {`
- Go `hugo-invented-function-4` `common/loggers/logger.go:197`: `StdErrGw() io.Writer`
- Go `hugo-invented-method-2` `tpl/tplimpl/templatestore.go:1429`: `hyphenIdx := strings.IndexGw(name, "-")`
- Rust `rust-analyzer-invented-function-1` `crates/hir-def/src/builtin_type.rs:97` (type timeout): `BuiltinInt::I64 => Name::new_symbol_root_gw(sym::i64),`
- Rust `rust-analyzer-wrong-import-5` `crates/ide/src/inlay_hints/implied_dyn_trait.rs:77` (type timeout): `use crate::inlay_hints::InlayHintsConfig_gw;`

## Blocking findings on designated-clean commits (B)

None.

## Timeouts, unchecked cases and harness errors

- Rust: 22 x type timeout

## Environment

- node: v24.22.2
- platform: linux x64, 8 CPUs
- go: go version go1.26.9 linux/amd64
- javac: javac 17.0.20.1
- cargo: cargo 1.99.1 (5f94df478 2026-08-27)
- dotnet: 11.0.100

Raw rows: `<language>.cases.json` and `<language>.latency.json`. Protocol and limitations: `../PREREGISTRATION.md`.

## Notes added after the run

Written by hand after reading the rows above; the tables and lists are the runner's output, unchanged. The protocol for this run is `../PREREGISTRATION-v2.md` (the line above names the first run's file). The first run is `../results/RESULTS.md` and stands as published.

- Result on the rerun set: Go passes every rule; Rust fails the coverage rule again. C# was not changed and not rerun; its first-run FAIL stands.
- This set is not held out: the checker was changed after reading the first run's rows, and these cases were run during development. Go's held-out set is `../results-v2-heldout/RESULTS.md`.

| Language | Run | Seeded caught | Seeded timed out | Clean cases checked | Blocks on clean | Status |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Go | first | 32/35 | 0 | 79/100 | 0 | FAIL |
| Go | second, rerun set | 32/35 | 0 | 100/100 | 0 | PASS |
| Go | second, held-out set | 32/35 | 0 | 100/100 | 0 | PASS |
| Rust | first | 24/40 | 16 | 73/100 | 0 | FAIL |
| Rust | second, rerun set | 38/40 | 2 | 80/100 | 0 | FAIL |
| C# | first (not rerun) | 34/38 | 0 | 60/100 | 0 | FAIL |

- Rust: all 22 timeouts (2 seeds, 20 clean cases) are on rust-analyzer. The rise in seeded catches from 24 to 38 comes from two changes that this run cannot separate: the checker no longer builds test targets for every file, and the harness now warms the compiler before each seeded case (see the preregistration). The two seeds that timed out were caught in 1.4 s and 3.2 s when rerun alone with a 120 s budget.
- Rust clean coverage is 80%, below the 90% rule. Rerun with a 120 s budget (`../results-v2-exploratory/`, decides nothing), the 20 timed-out clean cases were all checked, none blocked, and took 3.5 to 23.2 s, median 7.9 s; 2 of the 20 finished within 4 s. That time is `cargo check` re-checking the edited crate and the crates that depend on it. The checker does not make large Rust workspaces fit the 4 s budget.
- The latency rule passes for both, but as in the first run it times a comment-only edit on a warm cache and does not show that real checks fit the budget.
- The three Go misses rename a declaration; the compiler error is at the callers, not on the changed line, so the changed-line filter drops it. Same cause as in the first run.

# Compiled-language type-checking gate results

**Deterministic tool-level evaluation, NOT an agent run.** Nothing here supports a speed, token, cost or competitor claim.

Preregistered manifest SHA256: `5e8e9f2c073c70627198e801305f5e5893e065f32b32d8d5094abf575925a590`. Checker commit: `c160cacc92e95dc704bfbd7f213d8ac12cc56649`.

| Language | Status | Seeded caught, grounding only (A) | Seeded caught, with types (B) | Recall B | Seeded timed out | Clean cases (checked) | Blocks on clean A / B | Stop type-check p50 / p95 ms | `gw init` ms (3 runs) | Latency repo lines | Complete |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Go | **FAIL** | 0/35 | 32/35 | 91.4% | 0 | 100 (79) | 0 / 0 | 145.207 / 224.404 | 1888, 1968, 2059 | 235173 (hugo) | yes |
| Java | **PASS** | 0/40 | 40/40 | 100.0% | 0 | 100 (93) | 0 / 0 | 447.105 / 507.32 | 2984, 2781, 2703 | 217216 (commons-lang) | yes |
| Rust | **FAIL** | 0/40 | 24/40 | 60.0% | 16 | 100 (73) | 0 / 0 | 86.371 / 196.629 | 6026, 5651, 5612 | 597947 (rust-analyzer) | yes |
| C# | **FAIL** | 0/38 | 34/38 | 89.5% | 0 | 100 (60) | 0 / 0 | 1274.824 / 2609.012 | 2279, 1883, 1537 | 107613 (polly) | yes |

## Preregistered rules

| Language | Seeded >= 30 and recall >= 85% | Clean cases >= 100 and blocks <= 1 per 100 | Clean cases checked >= 90% | Stop type-check p95 <= 4000 ms | `gw init` < 60 s | Latency repo >= 100000 lines |
| --- | --- | --- | --- | --- | --- | --- |
| Go | PASS | PASS | FAIL | PASS | PASS | PASS |
| Java | PASS | PASS | PASS | PASS | PASS | PASS |
| Rust | FAIL | PASS | FAIL | PASS | PASS | PASS |
| C# | PASS | PASS | FAIL | PASS | PASS | PASS |

## Seeded errors by operator (caught by B / total)

| Language | invented-function | invented-method | wrong-arity | wrong-import |
| --- | ---: | ---: | ---: | ---: |
| Go | 8/10 | 9/10 | 10/10 | 5/5 |
| Java | 10/10 | 10/10 | 10/10 | 10/10 |
| Rust | 6/10 | 7/10 | 6/10 | 5/10 |
| C# | 7/10 | 10/10 | 9/10 | 8/8 |

## Missed seeded errors

- Go `hugo-invented-function-2` `magefile.go:89`: `if err := runWithGw(flagEnv(), goexe, "generate", path.Join(packageName, pkg)); err != nil {`
- Go `hugo-invented-function-4` `common/loggers/logger.go:197`: `StdErrGw() io.Writer`
- Go `hugo-invented-method-2` `tpl/tplimpl/templatestore.go:1429`: `hyphenIdx := strings.IndexGw(name, "-")`
- Rust `rust-analyzer-invented-function-2` `crates/ide/src/join_lines.rs:174` (type timeout): `if join_single_expr_block_gw(edit, token).is_some() {`
- Rust `rust-analyzer-invented-function-3` `crates/hir-def/src/import_map.rs:88` (type timeout): `let map = Self::collect_import_map_gw(db, krate);`
- Rust `rust-analyzer-invented-function-4` `crates/ide-assists/src/handlers/auto_import.rs:236` (type timeout): `let expected = expected_gw(Either::Right(pat.clone().into()));`
- Rust `rust-analyzer-invented-function-5` `crates/rust-analyzer/src/cli/analysis_stats.rs:1173` (type timeout): `_ if self.output.is_some() => ProgressReport::hidden_gw(),`
- Rust `rust-analyzer-invented-method-1` `crates/rust-analyzer/src/main_loop.rs:625` (type timeout): `if let Some((cause, ())) = self.prime_caches_queue.should_start_op_gw() {`
- Rust `rust-analyzer-invented-method-2` `crates/hir-ty/src/mir/eval.rs:2329` (type timeout): `let field_types = this.db.field_types_gw(s.into());`
- Rust `rust-analyzer-invented-method-5` `crates/ide-completion/src/render/const_.rs:27` (type timeout): `.set_deprecated_gw(ctx.is_deprecated(const_, const_.as_assoc_item(db)))`
- Rust `rust-analyzer-wrong-arity-1` `crates/ide-assists/src/handlers/extract_variable.rs:359` (type timeout): `parse_expr_from_str(&text, ctx.edition(), 0, 0)`
- Rust `rust-analyzer-wrong-arity-3` `crates/hir-ty/src/next_solver/infer/mod.rs:1152` (type timeout): `TyKind::CoroutineClosure(_, args) => args.as_coroutine_closure(0, 0).kind_ty(),`
- Rust `rust-analyzer-wrong-arity-4` `crates/ide-db/src/search.rs:199` (type timeout): `let source_root_id = db.file_source_root(root_file).source_root_id(db, 0, 0);`
- Rust `rust-analyzer-wrong-arity-5` `crates/ide-db/src/symbol_index.rs:786` (type timeout): `query.exclude_imports(0, 0);`
- Rust `rust-analyzer-wrong-import-1` `crates/hir-ty/src/next_solver/infer/type_variable.rs:16` (type timeout): `use crate::next_solver::Ty_gw;`
- Rust `rust-analyzer-wrong-import-2` `crates/hir-def/src/macro_expansion_tests/mbe/meta_syntax.rs:5` (type timeout): `use crate::macro_expansion_tests::check_gw;`
- Rust `rust-analyzer-wrong-import-3` `crates/hir-ty/src/next_solver/infer/snapshot/undo_log.rs:12` (type timeout): `use crate::next_solver::infer::unify_key::ConstVidKey_gw;`
- Rust `rust-analyzer-wrong-import-4` `crates/ide/src/typing.rs:32` (type timeout): `use crate::SourceChange_gw;`
- Rust `rust-analyzer-wrong-import-5` `crates/ide/src/inlay_hints/implied_dyn_trait.rs:77` (type timeout): `use crate::inlay_hints::InlayHintsConfig_gw;`
- C# `polly-invented-function-2` `src/Polly.Core/Registry/RegistryPipelineComponentBuilder.cs:24`: `internal (ResilienceContextPool? ContextPool, PipelineComponent Component, ResilienceStrategyTelemetry Telemetry) CreateComponentGw()`
- C# `polly-invented-function-3` `src/Polly/Retry/RetrySyntax.cs:152`: `public static RetryPolicy RetryForeverGw(this PolicyBuilder policyBuilder, Action<Exception, Context> onRetry)`
- C# `polly-wrong-arity-3` `src/Polly/ISyncPolicy.cs:148`: `PolicyResult ExecuteAndCapture(Action<CancellationToken> action, CancellationToken cancellationToken, 0, 0);`
- C# `serilog-invented-function-2` `src/Serilog/Context/LogContext.cs:55`: `public static IDisposable PushPropertyGw(string name, object? value, bool destructureObjects = false)`

## Blocking findings on designated-clean commits (B)

None.

## Timeouts, unchecked cases and harness errors

- Go: 21 x type timeout
- Java: 7 x type timeout
- Rust: 43 x type timeout
- C#: 32 x type timeout
- C#: 6 x csharp: A compatible .NET SDK was not found.
- C#: 2 x csharp: no .csproj

## Environment

- node: v24.22.2
- platform: linux x64, 8 CPUs
- go: go version go1.26.9 linux/amd64
- javac: javac 17.0.20.1
- cargo: cargo 1.99.1 (5f94df478 2026-08-27)
- dotnet: 11.0.100

Raw rows: `<language>.cases.json` and `<language>.latency.json`. Protocol and limitations: `../PREREGISTRATION.md`.

## Notes added after the run

Written by hand after reading the rows above; the tables and lists are the runner's output, unchanged except the raw-file names in the line above.

- Result: Java passes every rule. Go, Rust and C# fail. Phase 1's exit gate is not met.
- The latency rule passes for all four, but it times a comment-only edit on a warm compiler cache. It does not show that real checks fit the budget: 21 Go, 7 Java, 27 Rust and 32 C# clean cases, and 16 Rust seeds, hit the 4,000 ms timeout. All Go and Rust timeouts are on the large repository (Hugo, rust-analyzer); C# has 28 on Polly and 4 on Serilog. A timed-out check fails open, so the agent gets no type finding at all.
- Rust recall is 60%: all 16 misses are rust-analyzer timeouts. `cargo check` of a large crate after an edit takes about 4 to 6 s here.
- C#: 6 clean cases are historical commits whose `global.json` asks for an SDK that is not installed, and 2 touch files outside any `.csproj`.
- Several Go and C# misses rename a declaration (`StdErrGw() io.Writer`, `PushPropertyGw(...)`). The compiler error for those is at the callers, not on the changed line, so the changed-line filter drops it.
- Grounding alone (arm A) caught 0 of 153 seeds in these four languages.
- No block on any of the 400 clean commits, but only 305 of them were actually checked.

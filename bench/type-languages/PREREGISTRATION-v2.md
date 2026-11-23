# Compiled-language type gate, second run: preregistration

Frozen before the measured second run. `scripts/bench-type-languages.ts run --preregistration PREREGISTRATION-v2.md` refuses to start unless the manifest it is given has a hash listed here, and refuses to overwrite an existing result part.

- `manifest.json` SHA256: `5e8e9f2c073c70627198e801305f5e5893e065f32b32d8d5094abf575925a590` (the first run's manifest, unchanged)
- `manifest-heldout.json` SHA256: `404a90e70f0155e83efeac3afbca47560b933cfe7b98be5ef06012fa93203dfa`

The first run (`PREREGISTRATION.md`, `results/RESULTS.md`) stands as published: Java PASS; Go, Rust and C# FAIL. This run asks whether the checker changes below make Go and Rust pass the same rules. Thresholds, budget (4,000 ms, offline) and case definitions are those of the first run.

## What changed in the checker

- Go: a small Go program (`src/types/go-checker.ts`, built once per Go version with the toolchain on the machine) type-checks the changed packages from source with `go/types`. The module's own packages are checked declarations-only, the standard library and the module cache are read from export data, and nothing is compiled or linked. A changed test file is checked against the test build of its package. All changed Go files of a module are checked in one run. `go build` / `go vet` remain only as the fallback when that program cannot be built.
- Rust: `cargo check` runs for the library and binaries first. `--all-targets` runs only when the changed lines are in code that only a test build compiles (a `cfg(test)` or `#[test]` item, a file under `tests/`, `benches/` or `examples/`, or a file the plain build's dependency file does not list) and the plain build found no blocking error in the file. The first run used `--all-targets` for every file that contained a test attribute.
- C#: unchanged, and not rerun. On Polly the compiler alone takes about 4 s for the largest test project (`Polly.Specs`, 47,000 lines; `Csc` 4.0 to 4.6 s in four hand-timed builds on a machine that was also running another job), and a `dotnet build` that compiles nothing takes about 2.3 s. Building the changed projects in one MSBuild run, skipping project references, and building only the `Compile` target were tried by hand and did not bring a test-project edit under the budget. Its first-run FAIL stands.

## What changed in the harness

1. Seeded cases: the warm-up (the checker run untimed on the unedited file, clean and with a throwaway error) now runs before each seeded case. The first run's text says this; its harness warmed all seeded files of a repository once, before the first case. Restoring a seed gives its file a new modification time, so in the first run the next case's 4 s also paid for re-checking every crate downstream of the previous seed's crate. This is why 16 rust-analyzer seeds timed out there.
2. The warm-up's clean check covers the whole file instead of line 1, so the Rust test targets a file belongs to are warm, as they were when the checker always used `--all-targets`.
3. New options: `--manifest`, `--preregistration`, `--out`, and for `generate` `--seed`, `--skip-commits`, `--language`. `--budget-ms` or `--ids` make an exploratory run, which writes `<language>.exploratory.json` only and never a gate result.

## Sets

- Rerun set (Go, Rust): `manifest.json`. **Not held out.** The checker was changed after reading the first run's rows, and during development these cases were run with the new checker: the 24 Go cases the first run missed or timed out (once), the 43 rust-analyzer cases the first run missed or timed out (a partial run at 4 s with the first run's warm-up, and one full run at a 120 s budget with this run's), and a few single cases by hand (Hugo `b76fde2fbd`, rust-analyzer `9efc867bd8`, two rust-analyzer seeds).
- Held-out set (Go): `manifest-heldout.json`, from the same syntax-only generator with seed 24112026: 35 seeded errors on other lines (none shared with the rerun set; 18 are in files the rerun set also seeds) and, per repository, the 50 commits before the first run's 50 (100 clean cases, none shared). No checker has been run on any of its cases. Older commits may need dependencies or a Go version the machine lacks; such cases count as unchecked.
- The held-out set of a language is run only if that language passes every rule on the rerun set. If Rust passes the rerun set, its held-out manifest is generated with the same seed and `--skip-commits 50`, and its hash is added here in a separate commit before it runs.

## Rules

The first run's table, unchanged, per language and per set. A language is PASS only when it passes every rule on the rerun set and on its held-out set. FAIL is any rule missed on either. INCOMPLETE as before. The latency part is rerun for each set that is run.

## Exploratory, not part of the gate

After the gate rows are written, the cases that hit the 4,000 ms timeout (Rust: in this run's rerun set; C#: in the first run) are run once more with a 120,000 ms budget, to publish how long those checks take. These rows decide nothing.

## Limitations known before the run

- The rerun set is a regression set, not evidence on unseen cases; only the Go held-out set is.
- Rust is expected to fail the coverage rule again: in the 120 s development run, 24 of the 27 rust-analyzer clean cases that timed out in the first run took 4.6 to 26 s (a one-file edit in `hir-ty` 8.6 to 9.6 s), which is `rustc` checking large crates and the crates downstream of them.
- Harness change 1 makes the seeded cases easier than in the first run for every language. It is disclosed above so the two runs' seed rows are not read as the same measurement.
- The held-out clean cases are older commits of the same two repositories per language, not other repositories.
- Seeded errors are synthetic; this is a tool-level run on one machine. Nothing here supports a speed, token, cost or competitor claim.

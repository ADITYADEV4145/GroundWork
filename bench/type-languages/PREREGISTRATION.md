# Compiled-language type gate: preregistration

Frozen before the measured run. `scripts/bench-type-languages.ts run` refuses to start if `manifest.json` differs from this hash, and refuses to overwrite an existing result part.

Manifest SHA256: `5e8e9f2c073c70627198e801305f5e5893e065f32b32d8d5094abf575925a590`

## Question

Does adding the compiler-backed check (arm B: grounding + types) to grounding alone (arm A) catch seeded errors in Go, Java, Rust and C# on real repositories, without blocking real merged commits, inside the Stop budget?

## Corpus

Eight pinned repositories, two per language (`repos.json`): Hugo and Cobra (Go), Commons Lang and Commons Collections (Java), rust-analyzer and ripgrep (Rust), Polly and Serilog (C#). The first of each pair is the latency corpus and has at least 100,000 lines of that language.

## Cases (all in `manifest.json`, seed 23112026)

- Seeded errors: one-line edits to product source files (tests, generated and vendored code excluded), chosen by SHA256 rank of the seed: invented function, invented method, wrong arity, wrong import. 10 per operator per language where the corpus has enough candidates; each language has at least 30. A seed is caught when the arm blocks on the mutated file and line.
- Clean cases: 100 per language, real non-merge commits from the pinned history that touch product files of that language, replayed as an uncommitted change against the parent. A block on a clean case is a false block.
- Latency: 20 cold (fresh process) and 20 warm type checks of a one-line edit to a frozen file of 200+ lines in the latency repository, after one untimed warm-up; `gw init` three times from an empty `.groundwork`.

## Rules, per language

| Rule | Threshold |
| --- | --- |
| Seeded errors | at least 30 |
| Recall of arm B on seeded errors | at least 85% |
| False blocks of arm B on clean cases | at most 1 per 100, on at least 100 cases |
| Clean cases the compiler actually checked | at least 90% |
| Stop type check p95 (cold and warm samples together) | at most 4,000 ms |
| `gw init` on the latency repository | under 60 s, every run |
| Latency repository size | at least 100,000 lines |

PASS needs every rule. FAIL is any rule missed. INCOMPLETE is a harness error or a toolchain that could not check a seeded file. A type check that hits the 4,000 ms timeout is a result, not a gap: a timed-out seed is a miss, a timed-out clean case is unchecked.

## Conditions

- Every measured check runs offline with a 4,000 ms budget. Dependency download (`go mod download`, `cargo fetch`, `dotnet restore`) is setup and is not timed.
- Before the measured calls of a case the checker is run untimed on the unedited files, once clean and once with a throwaway error, so compiler caches and the base-text comparison are in the state of a session that has already checked those files once. First-ever checks on a cold compiler cache are therefore not what the case rows measure.
- All results are published, including FAIL and INCOMPLETE.

## Limitations known before the run

- This is not a held-out set in the strict sense: during development a pilot ran a subset of these repositories with 2 seeds per operator and 3 clean commits per repository, from an earlier manifest drawn by the same generator. The pilot found timeouts on Hugo, rust-analyzer and Polly, and led to the changes listed below. No allowlist entry or mutation operator was changed after seeing pilot catches or misses.
- Changes made after the pilot: clean commits are drawn from full history instead of first-parent (first-parent gave too few cases), mutation candidates inside raw strings are skipped, the resolver in `src/resolve/additional.ts` was indexed (Hugo `gw init` did not finish before), base diagnostics are cached per commit, C# picks a restored target framework, timeouts are counted instead of dropped.
- Seeded errors are synthetic single-line edits; they are not a sample of real agent mistakes.
- Java is checked with `javac` on source roots and locally available jars only; with an incomplete classpath its findings are informational, so recall there depends on what is on disk.
- One machine, one run. No comparison with any other tool is made or implied.

# Dependency-hallucination gate: preregistration

Committed before the runner was executed for the first time. The result is published in `results/` whether it
passes or fails, and this file is not edited after the first run; any later change is a new, versioned
preregistration next to it.

## Question

When a coding agent calls something in an installed dependency that does not exist in the installed version
(an invented name, a name from another library or an older major version, a wrong argument count), does
Groundwork flag it from local files alone, without blocking correct code?

## Cases

`cases.json` holds 69 seeded cases: npm 22, PyPI 18, Go 14, Maven 15. Each case has a prelude, one `good` line
that uses the real API and one `bad` line. Kinds: unknown member 38, unknown export 20, wrong argument count 11.
The packages and versions are pinned in the same file.

The cases were written from memory of common agent mistakes (APIs removed in the installed major version,
names borrowed from a sibling library, plausible but invented names) and were **not** checked against
Groundwork's reader before this commit. Sixteen ad hoc calls were tried while building the feature
(`deepMerge`, `fetchJson`, `parseDate`, `readFileSyncc`, `joinAll`, `makeRequest`, `fetch_json`,
`TimeoutErrorr`, `secho_all`, `prnt`, `NewRandomV9`, `ToUpperCase`, `Printl`, `ImmutableLists`, `isBlank`,
`onComma`); none of them is in the set.

## Ground truth comes from each ecosystem's own tool, not from Groundwork

Before Groundwork sees a case, the runner checks it with the real toolchain against the installed packages:

| Ecosystem | `good` must | `bad` must |
| --- | --- | --- |
| npm | type-check with `tsc` | produce a `tsc` error on the seeded line |
| PyPI | compile | make its `probe` true in the project's interpreter (`hasattr` is false, or `inspect.signature(...).bind` raises) |
| Go | `go build` | fail `go build` |
| Maven | `javac` against the JARs | fail `javac` on the seeded line |

A case that fails this validation is excluded and listed in the result with the reason. The gate needs at
least 60 valid cases, at least 8 per ecosystem; otherwise the result is "invalid set", which is a fail.

## Metrics and thresholds

| Metric | Definition | Threshold |
| --- | --- | --- |
| Recall | valid cases with a Groundwork finding on the seeded line / valid cases | ≥ 80% |
| False blocks | blocking findings on lines that the toolchain accepts, per 100 dependency checks | ≤ 1 per 100 |
| Index time | cold `gw deps build` on a project with at least 500 installed packages | < 30 s |
| Network | sockets opened or DNS lookups made by the process while checking | 0 |

Also reported, without a threshold: recall per ecosystem and per kind, the share of caught cases that block
(the rest are warnings), warm (cached) index time, and every miss with the reason the reader gave.

Lines the toolchain accepts are: the `good`-only variant of every valid case, every non-seeded line of the
`bad` variants, and four control corpora of real code that builds against the same installed packages:
Groundwork's own `src/`, `scripts/` and `test/` (TypeScript, type-checks in CI); the installed sources of
`requests`, `click` and `jinja2` checked against their own installed dependencies; the `uuid` and `pflag`
module sources checked against the Go standard library; and the `commons-text` 1.11.0 sources checked against
`commons-lang3`. A "dependency check" is one import or call compared with a dependency surface
(`DependencyChecker.stats.checks`).

The network count is taken in-process by wrapping `net.Socket.prototype.connect`, `dns.lookup` and
`globalThis.fetch` for the duration of the checks and the index build. Setup (installing the pinned packages)
happens before and is a dev-only script, not part of the tool.

## What this does not show

Seeded single-line mistakes are easier than mistakes in real agent output. Rust is warnings-only and has no
cases. Service contracts (OpenAPI, GraphQL, protobuf) are warnings-only and are not part of this gate. Python
and JavaScript surfaces that cannot be fully listed (dynamic exports, native modules, untyped JavaScript) are
left unchecked by design, which costs recall; the misses are published.

## Reproduce

```sh
npm run setup:deps-bench   # dev-only: downloads the pinned packages into ~/.cache/groundwork-bench/deps
npm run bench:deps         # offline; writes bench/deps/results/
```

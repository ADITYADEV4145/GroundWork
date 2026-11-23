# Phase 5 gate: measured results

Protocol: [PROTOCOL.md](PROTOCOL.md), committed before the first run. Measured 2026-11-23 on GroundWork `c261520`, 8 cores, 31 GB, linux 6.8.0-1060-aws, Node v24.22.2. Raw data is in `runs/`.

## Outcome

| Check | Target | Measured | Result |
| --- | --- | --- | --- |
| Scan time | every run < 30 s on all 10 | run 2: slowest 19,864 ms (django). Run 1: one django scan took 34,852 ms | met in run 2, missed once in run 1 |
| Precision | ≥ 90% of 100 sampled findings | 3 of 100 correct (lenient: 28 of 100), reviewed by a Devin session, not a person | not met |
| Receipt | every run < 1 s | 8 of 10 repositories under 1 s; django 2,349 / 2,143 / 2,305 ms, newtonsoft-json 1,030 / 1,103 / 1,209 ms | not met |

The gate as a whole is not met.

## Two runs

Run 1 (`runs/run-1-stale-install`) used a `node_modules` that lacked the Go, Java, Rust and C# grammar packages listed in `package.json`. The scan of gin, gson, ripgrep and newtonsoft-json exited with `Cannot find module 'tree-sitter-<lang>/….wasm'` and no report. That is an install fault on the measuring machine, not a scan result, so after `npm ci` the whole set was measured again as run 2. Run 1 is kept unchanged. Its timings for the six repositories that did scan are real measurements, including the one django scan over 30 s; that slow scan was the first of three and did not recur in the two after it or in run 2, and its cause was not investigated.

## Scan time (run 2)

Whole-process wall time, index built from nothing each run.

| Repository | Language | Source lines | Files checked | Scan ms (3 runs) | Under 30 s |
| --- | --- | ---: | ---: | --- | --- |
| express | JavaScript | 21,634 | 50 | 444 / 440 / 437 | yes |
| axios | JavaScript | 51,158 | 100 | 1,079 / 970 / 971 | yes |
| vue-core | TypeScript | 172,594 | 319 | 4,350 / 4,178 / 4,181 | yes |
| flask | Python | 17,972 | 35 | 594 / 581 / 584 | yes |
| requests | Python | 12,034 | 21 | 528 / 492 / 501 | yes |
| django | Python | 558,069 | 935 | 19,619 / 19,864 / 19,164 | yes |
| gin | Go | 23,770 | 57 | 1,321 / 641 / 566 | yes |
| gson | Java | 57,395 | 122 | 2,644 / 1,298 / 1,295 | yes |
| ripgrep | Rust | 58,614 | 88 | 2,224 / 886 / 1,133 | yes |
| newtonsoft-json | C# | 192,913 | 786 | 7,209 / 2,271 / 2,293 | yes |

Source lines count every file with an indexed extension, tests included; the scan itself leaves out files it classes as tests or generated.

Run 1, for the six repositories that produced a report:

| Repository | Scan ms (3 runs) |
| --- | --- |
| express | 802 / 438 / 434 |
| axios | 1,850 / 939 / 927 |
| vue-core | 6,640 / 4,078 / 4,383 |
| flask | 977 / 571 / 575 |
| requests | 788 / 491 / 571 |
| django | 34,852 / 19,699 / 18,845 |

## What the scan reported (run 2, first run of each)

| Repository | Invented calls | Wrong arguments | Duplicate logic | Duplicate constants | Dead code | Low-confidence "check" | Files the call check could not check |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| express | 0 | 0 | 1 | 0 | 0 | 2 | 0 of 50 |
| axios | 0 | 0 | 2 | 0 | 0 | 0 | 1 of 100 |
| vue-core | 6 | 0 | 4 | 0 | 1 | 0 | 10 of 319 |
| flask | 0 | 0 | 2 | 0 | 3 | 0 | 0 of 35 |
| requests | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 21 |
| django | 3 | 0 | 74 | 244 | 0 | 80 | 0 of 935 |
| gin | 0 | 0 | 2 | 12 | 6 | 0 | 57 of 57 |
| gson | 0 | 0 | 18 | 0 | 0 | 0 | 122 of 122 |
| ripgrep | 0 | 0 | 86 | 4 | 495 | 0 | 88 of 88 |
| newtonsoft-json | 0 | 0 | 78 | 0 | 0 | 0 | 786 of 786 |

- For gin, gson, ripgrep and newtonsoft-json the report marks every file as one the call check could not check, so the zero invented calls and wrong arguments there mean "not checked", not "none found".
- Type errors were not checked in any repository: the scan only checks them on the changed lines of a diff, and these were whole-repository scans.
- No repository produced a wrong-arguments finding, so that category has no precision measurement.

## Precision

Pool: 1,041 high and medium confidence findings. Sample: 100, seed 20261123. Every verdict with its reason is in `runs/run-2/verdicts.json`.

The review was done by the Devin session that ran the scan, reading the pinned source for each finding. The plan asks for human review; that has not happened.

| Kind | Sampled | Correct | True, not actionable | Wrong |
| --- | ---: | ---: | ---: | ---: |
| invented-call | 2 | 0 | 0 | 2 |
| duplicate-logic | 27 | 3 | 3 | 21 |
| duplicate-constant | 22 | 0 | 22 | 0 |
| dead-code | 49 | 0 | 0 | 49 |
| Total | 100 | 3 | 25 | 72 |

Precision 3%, lenient 28%, against a target of 90%.

What the false alarms were:

- **Dead code, 49 wrong.** 48 are Rust `#[test]` or `#[bench]` functions in ripgrep, which the test harness runs; 1 is a Go `init()` in gin, which the runtime runs. ripgrep alone contributes 495 dead-code findings to the pool.
- **Duplicate logic, 21 wrong.** The message says "has the same body as", but the two bodies call different methods or use different types, fields or literals (for example `select_by_value` and `deselect_by_value`, `nextInt` and `nextLong`). Only their shape matches. 3 more are textually identical but cannot be merged (required overloads, tests in separate crates). 3 are real duplicates.
- **Duplicate constants, 22 true but not actionable.** All are django locale format files that each define the same setting name with the same value as another locale; each file has to define its own.
- **Invented calls, 2 wrong.** django: `from sphinx import addnodes` was resolved to the repository's own `tests/sphinx` package instead of the third-party one. vue-core: `./template/README.md?raw` exists; the `?raw` import suffix was not stripped.

The sample is dominated by ripgrep dead code and django constants because the pool is. Per-kind figures for the kinds with few sampled findings (invented calls: 2) are too small to generalise from.

## Receipt (run 2)

Whole-process wall time of `receipt --session <id> --png <file>`. Every run exited 0 and wrote a valid PNG.

| Repository | Receipt ms (3 runs) | Under 1 s |
| --- | --- | --- |
| express | 331 / 321 / 358 | yes |
| axios | 403 / 408 / 402 | yes |
| vue-core | 681 / 795 / 688 | yes |
| flask | 411 / 310 / 363 | yes |
| requests | 288 / 289 / 287 | yes |
| django | 2,349 / 2,143 / 2,305 | no |
| gin | 350 / 332 / 345 | yes |
| gson | 473 / 480 / 471 | yes |
| ripgrep | 384 / 512 / 419 | yes |
| newtonsoft-json | 1,030 / 1,103 / 1,209 | no |

Receipt time grows with repository size; the two largest repositories are the two over the limit. Run 1 measured django at 2,349 / 2,222 / 2,165 ms.

## Reproduce

`npm ci && npm run build && node scripts/bench-scan-oss.mjs <new-run-label>`. The script clones the pinned commits into `$GW_REAL_REPOS_CACHE` (default `~/work/gw-real-repos/scan-oss`) and refuses to write over an existing run.

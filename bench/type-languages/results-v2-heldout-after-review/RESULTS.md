# Compiled-language type-checking gate results

**Deterministic tool-level evaluation, NOT an agent run.** Nothing here supports a speed, token, cost or competitor claim.

Preregistered manifest SHA256: `404a90e70f0155e83efeac3afbca47560b933cfe7b98be5ef06012fa93203dfa`. Checker commit: `e0892e4509b22adf9eb9056fe6d3676b5333e3b4`.

| Language | Status | Seeded caught, grounding only (A) | Seeded caught, with types (B) | Recall B | Seeded timed out | Clean cases (checked) | Blocks on clean A / B | Stop type-check p50 / p95 ms | `gw init` ms (3 runs) | Latency repo lines | Complete |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Go | **PASS** | 0/35 | 32/35 | 91.4% | 0 | 100 (100) | 0 / 0 | 160.412 / 269.419 | 2545, 2564, 2764 | 235173 (hugo) | yes |

## Preregistered rules

| Language | Seeded >= 30 and recall >= 85% | Clean cases >= 100 and blocks <= 1 per 100 | Clean cases checked >= 90% | Stop type-check p95 <= 4000 ms | `gw init` < 60 s | Latency repo >= 100000 lines |
| --- | --- | --- | --- | --- | --- | --- |
| Go | PASS | PASS | PASS | PASS | PASS | PASS |

## Seeded errors by operator (caught by B / total)

| Language | invented-function | invented-method | wrong-arity | wrong-import |
| --- | ---: | ---: | ---: | ---: |
| Go | 9/10 | 8/10 | 10/10 | 5/5 |

## Missed seeded errors

- Go `hugo-invented-function-5` `markup/markup.go:105`: `GetHighlighterGw() highlight.Highlighter`
- Go `hugo-invented-method-3` `deploy/deploy.go:595`: `d.logger.InfofGw("  remote dropping %q due to exclude\n", obj.Key)`
- Go `hugo-invented-method-5` `tpl/tplimpl/templatestore.go:1787`: `if of, found := s.opts.OutputFormats.GetByNameGw(ofs); found {`

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

- This is the Go held-out set measured again after the review fixes to the Go checker; see `../results-v2-after-review/RESULTS.md`. These cases had been run before, so it is no longer a first look: `../results-v2-heldout/RESULTS.md`, measured before the fixes, is the held-out result and stands as published. Go passes every rule in both.

# Dependency-hallucination gate: v2 protocol, rerun after review fixes

The checker changed after the [v2 result](../results-v2/RESULTS.md) to fix four rounds of code-review findings (none drawn from the benchmark cases), so the unchanged v2 protocol and cases were run again on the fixed code. The same eight cases are missed. The accepted-check count differs because Groundwork's own source, which is one of the accepted corpora, grew.

Protocol: [PREREGISTRATION-v2.md](../PREREGISTRATION-v2.md); the first run is in [../results](../results/RESULTS.md). Commit `01a1aa436d`, Node v24.22.2. Raw data: [result.json](result.json).

**Gate: PASS**

| Metric | Result | Threshold | |
| --- | --- | --- | --- |
| Valid cases | 69 of 69 | ≥ 60, ≥ 8 per ecosystem | pass |
| Recall | 61/69 (88.4%) | ≥ 80% | pass |
| False blocks | 0 in 8221 accepted checks (0 per 100) | ≤ 1 per 100 | pass |
| Index time, cold | 3.1 s for 1048 packages | < 30 s for ≥ 500 | pass |
| Network calls | 0 | 0 | pass |

Of the caught cases, 100% block; the rest are warnings. Warm index time: 0.21 s (1048 surfaces from the per-version cache). Of the 1048 timed packages, 392 could be fully listed and 656 are left open (unchecked).

## Recall by ecosystem and kind

| Group | Caught | Recall |
| --- | --- | --- |
| npm | 21/22 | 95.5% |
| pypi | 12/18 | 66.7% |
| go | 13/14 | 92.9% |
| maven | 15/15 | 100% |
| unknown-member | 36/38 | 94.7% |
| unknown-export | 17/20 | 85% |
| arity | 8/11 | 72.7% |

## Accepted code checked for false blocks

| Corpus | Files | Dependency checks | False blocks | Warnings |
| --- | --- | --- | --- | --- |
| good-only variants | 69 | 80 | 0 | 0 |
| requests, click, jinja2 sources | 59 | 36 | 0 | 0 |
| uuid, pflag sources | 81 | 546 | 0 | 0 |
| commons-text sources | 106 | 118 | 0 | 0 |
| Groundwork src, scripts, test | 316 | 7366 | 0 | 0 |

## Misses

- `npm-04`: `export const b = _.chunk();`
- `pypi-04`: `from requests.adapters import RetryAdapter`
- `pypi-05`: `b = requests.get()`
- `pypi-10`: `from click.testing import CommandRunner`
- `pypi-12`: `b = yaml.safe_parse("a: 1")`
- `pypi-13`: `b = yaml.load_file("a.yml")`
- `pypi-14`: `from yaml import FastLoader`
- `go-03`: `var _ = uuid.NewSHA1(uuid.Nil)`

## Excluded by the toolchain check

None.

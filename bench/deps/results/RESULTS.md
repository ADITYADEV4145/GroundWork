# Dependency-hallucination gate: result

Protocol: [PREREGISTRATION.md](../PREREGISTRATION.md). Commit `94a88c3b36`, Node v24.22.2. Raw data: [result.json](result.json).

**Gate: FAIL**

| Metric | Result | Threshold | |
| --- | --- | --- | --- |
| Valid cases | 69 of 69 | ≥ 60, ≥ 8 per ecosystem | pass |
| Recall | 49/69 (71%) | ≥ 80% | fail |
| False blocks | 0 in 7798 accepted checks (0 per 100) | ≤ 1 per 100 | pass |
| Index time, cold | 3.0 s for 1048 packages | < 30 s for ≥ 500 | pass |
| Network calls | 0 | 0 | pass |

Of the caught cases, 100% block; the rest are warnings. Warm index time: 0.21 s (1048 surfaces from the per-version cache). Of the 1048 timed packages, 392 could be fully listed and 656 are left open (unchecked).

## Recall by ecosystem and kind

| Group | Caught | Recall |
| --- | --- | --- |
| npm | 21/22 | 95.5% |
| pypi | 0/18 | 0% |
| go | 13/14 | 92.9% |
| maven | 15/15 | 100% |
| unknown-member | 31/38 | 81.6% |
| unknown-export | 11/20 | 55% |
| arity | 7/11 | 63.6% |

## Accepted code checked for false blocks

| Corpus | Files | Dependency checks | False blocks | Warnings |
| --- | --- | --- | --- | --- |
| good-only variants | 69 | 66 | 0 | 0 |
| requests, click, jinja2 sources | 59 | 36 | 0 | 0 |
| uuid, pflag sources | 81 | 546 | 0 | 0 |
| commons-text sources | 106 | 118 | 0 | 0 |
| Groundwork src, scripts, test | 289 | 6984 | 0 | 0 |

## Misses

- `npm-04`: `export const b = _.chunk();`
- `pypi-01`: `b = requests.get_json("http://x")`
- `pypi-02`: `from requests import AsyncSession`
- `pypi-03`: `from requests.exceptions import NetworkError`
- `pypi-04`: `from requests.adapters import RetryAdapter`
- `pypi-05`: `b = requests.get()`
- `pypi-06`: `from requests.utils import parse_url_params`
- `pypi-07`: `b = click.print_line("x")`
- `pypi-08`: `b = click.get_terminal_size()`
- `pypi-09`: `from click import MultiChoice`
- `pypi-10`: `from click.testing import CommandRunner`
- `pypi-11`: `b = click.confirm_prompt("ok?")`
- `pypi-12`: `b = yaml.safe_parse("a: 1")`
- `pypi-13`: `b = yaml.load_file("a.yml")`
- `pypi-14`: `from yaml import FastLoader`
- `pypi-15`: `from jinja2 import TemplateEngine`
- `pypi-16`: `from jinja2 import Markup`
- `pypi-17`: `b = jinja2.DirectoryLoader("t")`
- `pypi-18`: `b = unquote_unreserved("a", "b", "c")`
- `go-03`: `var _ = uuid.NewSHA1(uuid.Nil)`

## Excluded by the toolchain check

None.

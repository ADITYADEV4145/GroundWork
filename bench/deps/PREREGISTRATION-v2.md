# Dependency-hallucination gate: preregistration v2

Committed before the v2 run. [v1](PREREGISTRATION.md) ran once and **failed**: recall 49/69 (71%), PyPI 0/18.
That result stays published in [results/](results/RESULTS.md).

## What v1 got wrong

The v1 harness copied the sources of `requests`, `click` and `jinja2` into the case project as a control
corpus. A directory named `requests` inside a repo is a local package, so the index resolved the cases'
`import requests` to that copy and the dependency checker, which only looks at imports that leave the repo,
never saw 15 of the 18 PyPI cases. That is a harness mistake, not the behaviour being measured: a project that
installs `requests` does not also keep a copy of it at its root.

The three `yaml` cases, `npm-04`, `go-03` and anything else missed for a different reason are not touched by
this change.

## The one change

The Python control corpus moves to a repo of its own (`control-py` in the bench cache) that shares the case
project's virtualenv. Nothing else changes: the same 69 cases in `cases.json`, the same toolchain ground
truth, the same metrics and thresholds as v1, the same runner apart from where that corpus lives and where the
result is written (`results-v2/`).

No Groundwork source under `src/` changes between the v1 run and the v2 run.

## Thresholds (unchanged)

Recall ≥ 80% of valid cases; false blocks ≤ 1 per 100 accepted dependency checks; cold index of ≥ 500 packages
in < 30 s; 0 network calls; at least 60 valid cases with at least 8 per ecosystem.

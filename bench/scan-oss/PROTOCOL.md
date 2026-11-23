# Phase 5 gate: `gw scan` on 10 open source repositories

Written and committed before the first measured run. The gate, from the plan:

> scan on 10 popular OSS repos completes < 30 s each; human review of 100 random findings shows ≥ 90% precision; receipt renders in < 1 s.

## Repositories

The ten in `repos.json`, chosen before any of them was scanned: widely used projects, at least one for every language `gw scan` indexes with a type-aware adapter (JavaScript, TypeScript, Python, Go, Java, Rust, C#). Each is pinned to the commit of its latest release tag on 23 Nov 2026. `pallets/click` was used to smoke-test the script and is not in the set.

## Scan time

- Command: `node dist/cli/main.js scan <checkout> --json`, from a clean checkout with no `.groundwork` directory, so every run builds the index from nothing.
- Measured: wall time of the whole process, three runs per repository, the index deleted between runs.
- A repository passes when its slowest run is under 30 s and every run exits 0 or 1 with a JSON report. The check passes when all ten pass.
- A crash, a timeout (120 s) or unparseable output is a failure for that repository and is recorded as such.

## Precision

- Population: every finding in the `findings` list (high and medium confidence) of the first run of each repository, pooled. Low-confidence `check` entries are counted and reported but are not part of the precision population, because the scan lists them separately as things to look at.
- Sample: 100 findings drawn uniformly without replacement from the pool with a fixed seed (`20261123`), after sorting the pool by repository, file, line, kind and message. If the pool holds fewer than 100, all of them are reviewed.
- Each sampled finding gets one verdict, judged against the pinned source:
  - `correct`: the finding states something true and a maintainer could reasonably act on it.
  - `true-not-actionable`: the statement is literally true but acting on it would be wrong or pointless (for example two methods that must both exist to satisfy an interface).
  - `wrong`: the statement is false (the call exists, the arguments are valid, the bodies differ in behaviour, the function is referenced).
- Precision is `correct / reviewed`. `true-not-actionable` counts against precision; the lenient figure `(correct + true-not-actionable) / reviewed` is reported beside it.
- The check passes at precision ≥ 90%.
- The plan asks for human review. This review is done by the Devin session that ran the scan, not by a person. The record says so, and the precision check is not reported as passed on the plan's terms until a person has reviewed the sample.

## Receipt

- In each scanned checkout, with its index already built, one edit is made to a source file and reported through the Claude Code `post_tool` hook so a session exists.
- Measured: wall time of `node dist/cli/main.js receipt --session <id> --png <file>`, whole process, three runs per repository.
- The check passes when the slowest of all runs is under 1 s and each writes a PNG.

## Reporting

Every run is recorded in `results.json`, including failures. Nothing is rerun to replace a measured value; a rerun after a fix is recorded as a separate run with the reason.

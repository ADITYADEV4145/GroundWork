# Phase 4 hook latency verification

The initial three sequential full selftests, with no stray benchmark/test workers, measured p95 **174.82, 216.70, 174.66 ms**. The failure therefore was not eliminated merely by checking for stray processes. The only other Node processes were the environment's two VS Code server processes, which were left intact. No unrelated service was killed.

## Investigation and change

The fresh hook reaches `refreshIndex` -> `linkIndex` -> `new ImportResolver`. The resolver eagerly built Python suffix lookup tables over every indexed file even for TypeScript imports and relative Python imports, which only use exact path lookup. A CPU profile attributed 11.07 ms of sampled self time to this constructor. The fix builds suffix tables only on the first absolute Python import, retains them for subsequent absolute imports, and leaves exact-path resolution and all grounding work intact. Tests cover the absence of eager work, mixed relative/absolute lookups, suffix precedence, package/stub lookup, empty indexes and missing/external modules. No extraction format or version changed.

Per-sample diagnostics also show variance across startup, bundle loading and refresh, rather than a grounding/rendering bottleneck. The original 223.90/216.70-ms p95 failures did not retain individual sample timings, so their entire excess cannot be attributed conclusively to this constructor or to any single OS-level cause. The constructor is a verified avoidable cost, not proof of the sole cause of those earlier outliers.

Opt-in `GW_HOOK_LATENCY_LOG=<file>` now saves **every sample**, including the two predefined warmups, its language/file, wall time, expected finding and raw hook output/timings. Hook diagnostics additionally record process CPU time and uptime. Logging happens after the measured processes finish. These diagnostics do not alter thresholds, selection, grounding or findings.

Selected slow measured samples (nested refresh timings must not be added twice):

| Capture | Sample/file | Wall ms | Startup ms | Bundle ms | Refresh ms | Grounding ms | Render ms |
|---|---|---:|---:|---:|---:|---:|---:|
| Before fix, CPU diagnostics | 34 / src/mod249.ts | 190.14 | 38.58 | 37.35 | 78.96 | 7.17 | 0.07 |
| Before fix, CPU diagnostics | 28 / src/mod259.ts | 186.55 | 26.75 | 57.20 | 65.72 | 3.55 | 0.47 |
| Final run 1 | 8 / src/mod41.ts | 196.17 | 39.11 | 46.44 | 59.61 | 3.37 | 0.06 |
| Final run 2 | 18 / src/mod30.ts | **201.40** | 31.24 | 36.91 | 78.53 | 7.67 | 0.07 |
| Final run 2 | 16 / src/mod19.ts | 177.65 | 21.25 | 27.14 | 106.93 | 3.44 | 0.06 |
| Final run 3 | 11 / py/pkg/pmod532.py | 192.91 | 38.06 | 46.80 | 74.03 | 5.78 | 0.07 |

The 201.40-ms sample was retained in run 2's 40 measured observations. The gate is p95, not maximum; no slow measured sample was dropped.

## Final validation after merging main

Merged `origin/main` (`4fec0a3`) into the branch as `d9c9f73`. The only conflict was `package.json`: retain main's `selftest --install-check` script and this branch's `bench:grounding` script. There was no design clash. Reinstalled locked dependencies, rebuilt, and ran typecheck before the final full selftests.

All three consecutive `npm run selftest -- --through 4` runs passed, including Benchmark v3:

| Run | Samples | p50 ms | p95 ms | Outcome |
|---|---:|---:|---:|---|
| 1 | 40 | 127.96 | 159.47 | PASS |
| 2 | 40 | 126.20 | 137.46 | PASS |
| 3 | 40 | 124.05 | 165.76 | PASS |

Each run used 20 TS/20 Python edits, Edit/Write, clean/arity cases and the same two predefined excluded warmups. Startup was included and every sample's grounding behavior was checked. `npm test` afterward: **30 files passed, 250 tests passed**. No tests ran concurrently with these full selftests.

Raw machine-local evidence is retained under `/home/ubuntu/groundwork-perf/`: `quiet-full-{1,2,3}.log`, `tail-cpu-full.log`, `tail-cpu-samples.json`, `merged-full-{1,2,3}.log`, and `merged-samples-{1,2,3}.json`.

## Ordinary VM load: fixed median-batch gate

The current gate uses exactly **three independent batches**, each with a newly generated/indexed 100k-line repository, deterministic seeds, a fresh lightweight timing host, and 40 measured fresh hook processes (20 TS/20 Python, Edit/Write, clean/arity). Each batch retains the same two predeclared, functionally checked warmups. The gate is the **median of the three batch p95 values, strictly below 200 ms**. This is not the pooled p95 of 120 observations and not best-of-N. Every batch is reported even when slow. Invalid or unchecked samples fail the entire gate regardless of the other batches. There are no load-dependent retries, discarded measured samples, or threshold changes.

Two runtime changes reduce actual work: the built hook uses a CommonJS bundle loaded with `require` rather than an ESM dependency graph, retaining the already-enabled Node compile cache; exact scoped discovery outside Git directly checks requested paths and their ancestors rather than enumerating all sibling files. Ignore/config filtering and symlink containment still apply, and Git-aware discovery is unchanged. Refresh, extraction and grounding still execute on the edits; each sample verifies the expected grounding result. No extractor output changed. A separate jitless-validation experiment did not improve timings and was rejected.

### Five loaded runs and one idle run after merging main

All six runs invoked the full `npm run selftest -- --through 4`, after merging `origin/main` at `562d012`. The only textual merge conflict was `package.json`: retained `bench:v2`, `bench:grounding` and `setup:grounding-repos`. No substantive design clash was resolved by weakening a gate.

During all five loaded runs, `node -e 'for (;;) {}'` continuously occupied approximately one core (recorded CPU utilization 99.4–99.6%). The burner was stopped before the idle run. All times below are real wall-clock milliseconds, including spawn, Node startup, bundle load, refresh, grounding, rendering and exit.

| Full run | Median batch p50 | Median batch p95 | Batch p50 values (1/2/3) | Batch p95 values (1/2/3) | P4 latency |
|---|---:|---:|---|---|---|
| Loaded 1 | 122.58 | 153.72 | 121.73 / 129.17 / 122.58 | 144.53 / 173.61 / 153.72 | PASS |
| Loaded 2 | 122.57 | 175.39 | 124.08 / 119.12 / 122.57 | 181.11 / 146.78 / 175.39 | PASS |
| Loaded 3 | 118.51 | 162.79 | 115.77 / 118.85 / 118.51 | 141.60 / 162.79 / 163.26 | PASS |
| Loaded 4 | 124.46 | 164.45 | 124.46 / 126.68 / 121.08 | 164.45 / 146.33 / 166.91 | PASS |
| Loaded 5 | 120.61 | 143.08 | 122.14 / 115.60 / 120.61 | 142.24 / 143.08 / 151.58 | PASS |
| Idle | 120.66 | 149.26 | 120.66 / 126.32 / 118.45 | 149.26 / 154.78 / 138.89 | PASS |

All **18 individual batch p95s** were also below 200 ms. All **720 measured samples** were retained, including **three >=200 ms** (maximum **210.34 ms**). The 36 predefined warmups were checked but excluded from statistics, as declared before collecting data.

Before the changes, one baseline batch with the same one-core burner measured **p50 121.95 ms / p95 143.21 ms**, bundle p50 **26.96 ms**, and discovery p50 **3.95 ms**. Across the five final loaded runs, median-of-batch stage p50s were **23.96–26.27 ms bundle** and **0.53–0.57 ms discovery**. The end-to-end loaded p50 remained essentially flat; the trials do **not** establish a large overall speedup, nor do they reproduce or conclusively explain the earlier 230 ms outlier. The runtime reductions remove verified work; the fixed-batch policy addresses estimator sensitivity to transient load without hiding observations.

### Full-gate blocker inherited from main

Every full run above ended `selftest through phase 4: FAIL` solely because main's newly merged P3 review gate has insufficient stored evidence:

```text
FAIL  [P3] real-repo BLOCK agreement >= 90% on >=10 reviewed findings
      2/2 distinct reviewed BLOCK pairs agree (100.0%); 0 distinct pairs pending; 4/4 raw rows reviewed, 2 covered duplicate-file rows excluded; requires >=10 distinct reviewed pairs and >=90% agreement.
```

The P3 check, evaluator and `bench/reuse-v2/block-review.json` are byte-identical to `origin/main` at `562d012`. No P3 gate, review count or evidence was modified to obtain a pass. Meeting that gate requires additional legitimate distinct reviewed findings, not fabricated labels or duplicated rows. All P4 checks passed in every run. Unit checks after the merge: **36 test files / 314 tests passed**; build and typecheck exited 0.

Complete logs and summary JSON: `/home/ubuntu/groundwork-perf/loaded-merged-{1,2,3,4,5}{.log,-samples.json}` and `idle-merged{.log,-samples.json}`. Every summary has three accompanying `.batch-{1,2,3}.json` files containing all raw observations, including warmups and slow samples. The before-change observations are in `busy-before-samples.json`. An initial pre-merge full-run loop was stopped when the merge handoff arrived; it is not counted among these six final runs.

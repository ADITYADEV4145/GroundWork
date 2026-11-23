# V8 analysis — PR #39 product changes measured, not shipped

Published as v8 evidence only. PR #39 product changes were measured at243bb54 and are not shipped on main. All 64 v8b sessions retained, no killed 3e804c9/nav8-/lh8- data included. Product AND collector/grader pinned to `243bb549e352ee4a63e968230055cda0c165bbe5`. V7 is a separate descriptive reference, not pooled into any estimate or bootstrap.

## Provenance and grading

- New inputs: `/home/ubuntu/bench-v8b/nav` and `/home/ubuntu/bench-v8b/lh`, exactly32 exports each: runs1–16 for each arm, complete30-task nav and10-task LH fixed manifests. All captureRevision fields243bb54, protocol stable-v1, sessionStartBasis workspace-ready, Nodev24.22.2; action/task/session timing present, finite and ordered. Fixture revisions match unchanged manifests (nav e0709ce62f2e8766080ec753c90a46fc96620610; LH f2d5514fd96dac166b8e57c1790949fe67e65b05).
- Raw metadata agent=`Devin normal`, model=null are defaults, not independent provider/model identity verification.
- Detached worktree `/home/ubuntu/bench-diagnosis/v8b-243bb54-build`, built successfully using existing installed dependencies. Original shared dirty checkout was not changed. `git diff 940ec92 243bb54 -- bench/ src/bench/ 'scripts/bench*'` produced **empty output**.
- Ran the UNMODIFIED pinned `combine()` with experiment=`v7` (its stable-v1 selector), runs16, pinned build, explicit v8b capture paths and external outputRoot `/home/ubuntu/bench-diagnosis/v8b-analysis`. This is the same grading path as v7; the older script has no v8b selector. Its external `bench/*/v7/results` paths label the frozen analysis implementation, NOT reused v7 observations. The reports and unchanged v8b exports are archived under bench/{nav,long-horizon}/v8/. Reproduction: `node /home/ubuntu/bench-diagnosis/v8b-grade.mjs` (do not rerun unless needed).
- Grader uses unchanged acceptance checks and retains failures/costs. Arithmetic arm means; reduction=100*(1−GW/B). 10,000 independent whole-session bootstrap draws per metric with seed0x51ab17ed; nearest-rank indices249/9749. Adjusted lower index124 implements97.5% per-suite intervals (two-suite Bonferroni). No run-number pairing or post-hoc selection.
- Independently reproduced all12 v7/v8b primary intervals including adjusted bounds, matched raw session means/tool totals to grader outputs and verified128 input hashes unchanged. Evidence cannot independently audit all uncaptured agent behavior or prove no pre-init planning; no outer-session/VM/provider-time attribution is inferred.

## Primary results

Positive reduction favors GW; negative means more/slower. Nominal95% whole-session intervals.

| Suite | Primary estimand | Baseline mean | GW mean | Reduction [95% CI] | Success guardrail |
| --- | --- | --- | --- | --- | --- |
| nav | Session elapsed/task (ms) | 5,349.62 | 6,321.17 | -18.2% [-27.1, -10.4] | Met; B 480/480, GW 480/480 |
| nav | Bytes/session | 34,848.31 | 33,048.69 | 5.2% [-3.8, 13.2] | Met; B 480/480, GW 480/480 |
| nav | Tool-side ms/session | 1,604.53 | 8,739.16 | -444.7% [-501.5, -395.3] | Met; B 480/480, GW 480/480 |
| long-horizon | Session elapsed/task (ms) | 9,308.21 | 10,814.69 | -16.2% [-28.7, -4.7] | Met; B 160/160, GW 160/160 |
| long-horizon | Bytes/session | 5,858.75 | 6,774.69 | -15.6% [-40.5, 8.2] | Met; B 160/160, GW 160/160 |
| long-horizon | Tool-side ms/session | 504.32 | 1,561.25 | -209.6% [-324.3, -129.9] | Met; B 160/160, GW 160/160 |


### Confirmatory latency rule

Require the success guardrail (no category loses GW successes) AND a strictly positive multiplicity-adjusted latency lower bound. Bytes/tool time are primary cost reports, not alternative routes to an agent-latency win.

| Suite | Adjusted latency lower bound (97.5% per suite) | Guardrail | Outcome |
| --- | --- | --- | --- |
| nav | -28.35% | Met; B 480/480, GW 480/480 | No confirmatory latency win |
| long-horizon | -30.45% | Met; B 160/160, GW 160/160 | No confirmatory latency win |


### Success by category

| Suite | Category | B success | GW success |
| --- | --- | --- | --- |
| nav | locate | 208/208 | 208/208 |
| nav | trace | 176/176 | 176/176 |
| nav | fix | 48/48 | 48/48 |
| nav | feature | 48/48 | 48/48 |
| long-horizon | feature | 160/160 | 160/160 |


### Interpretation

- **nav**: Session elapsed/task (ms): higher with GW (CI excludes zero); Bytes/session: inconclusive (CI crosses zero); Tool-side ms/session: higher with GW (CI excludes zero).

- **long-horizon**: Session elapsed/task (ms): higher with GW (CI excludes zero); Bytes/session: inconclusive (CI crosses zero); Tool-side ms/session: higher with GW (CI excludes zero).

Equal success is not evidence of a correctness win. Bytes are emitted UTF-8 tool output; bytes/4 would be an estimate, not provider-billed tokens or dollar savings.


## LH GroundWork16: short envelope investigation

**Valid under the recorded stable-v1 timing/completeness rules and retained.** Start=1795333073872; end=1795333160088; difference=86,216ms = 86.216s, or 8,621.6ms/task. This is not a86s per-task value. All10 steps are complete and ordered, with14 instrumented actions inside task windows and all task windows inside the controller envelope.

The sum of begin→finish windows is 36,422ms; **49,794ms outside those windows is still included** in the session primary estimator. Start precedes first begin by 3,861ms. End follows the final task's endedAt by 7ms, consistent with capture.mjs recording the session end after final patch capture. Total tool-side duration is 710.103ms; remaining envelope time is not assigned to provider/model thinking. The code records start after first-workspace preparation and end at the last finish; install/build/pre-init instructions and export are excluded by design. Source: pinned capture.mjs init/finish branches and the raw export. The protocol has no minimum session duration and prohibits excluding unfavorable/favorable outliers. A short duration alone is not an exclusion criterion; raw timing validation does not prove the absence of unrecorded behavioral deviations.

| Task | begin→finish ms |
| --- | --- |
| lh-01 | 14,167 |
| lh-02 | 278 |
| lh-03 | 257 |
| lh-04 | 325 |
| lh-05 | 264 |
| lh-06 | 262 |
| lh-07 | 285 |
| lh-08 | 8,883 |
| lh-09 | 7,874 |
| lh-10 | 3,827 |


## Per-tool dispatch totals — v8b

Aggregate across16 sessions/arm, not per-session means. Includes hooks, transport and response construction within dispatch; excludes CLI startup before dispatch and final delivery. These records cannot isolate hook/index/relay subcomponents. Shell includes captured edits and cat/sed reads. Zero B MCP totals mean those tools were unavailable to baseline.

| Suite | Tool | B calls | B bytes | B tool ms | GW calls | GW bytes | GW tool ms | GW time share |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| nav | shell | 512 | 235,992 | 25,518.89 | 273 | 79,487 | 16,669.21 | 11.9% |
| nav | read | 455 | 321,581 | 153.52 | 188 | 84,464 | 21,755.99 | 15.6% |
| nav | callees | 0 | 0 | 0.00 | 16 | 3,527 | 1,358.05 | 1.0% |
| nav | callers | 0 | 0 | 0.00 | 30 | 6,800 | 3,041.38 | 2.2% |
| nav | find_code | 0 | 0 | 0.00 | 270 | 189,852 | 76,974.98 | 55.1% |
| nav | outline | 0 | 0 | 0.00 | 68 | 42,832 | 6,060.88 | 4.3% |
| nav | read_symbol | 0 | 0 | 0.00 | 148 | 121,242 | 13,615.21 | 9.7% |
| nav | read_symbols | 0 | 0 | 0.00 | 4 | 400 | 0.76 | 0.0% |
| nav | repo_map | 0 | 0 | 0.00 | 3 | 175 | 350.11 | 0.3% |
| nav | TOTAL | 967 | 557,573 | 25,672.41 | 1000 | 528,779 | 139,826.57 | 100.0% |
| long-horizon | shell | 239 | 76,755 | 8,053.35 | 209 | 53,035 | 8,229.34 | 32.9% |
| long-horizon | read | 49 | 16,985 | 15.76 | 3 | 431 | 295.69 | 1.2% |
| long-horizon | find_similar | 0 | 0 | 0.00 | 11 | 132 | 1,567.32 | 6.3% |
| long-horizon | outline | 0 | 0 | 0.00 | 18 | 9,932 | 6,355.23 | 25.4% |
| long-horizon | read_symbol | 0 | 0 | 0.00 | 32 | 43,937 | 5,835.10 | 23.4% |
| long-horizon | repo_map | 0 | 0 | 0.00 | 8 | 928 | 2,697.36 | 10.8% |
| long-horizon | TOTAL | 288 | 93,740 | 8,069.11 | 281 | 108,395 | 24,980.03 | 100.0% |


## Per-call find_code/repo_map — v7 versus v8b

GW calls only, all captured calls retained. **Descriptive cross-round**, not randomized latency contrasts; query/root/cache/call mixtures may differ. Do not pool nav repo_map with first-request LH repo_map.

| Suite | Tool | v7 calls | v7 mean ms | v7 median ms | v8b calls | v8b mean ms | v8b median ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nav | find_code | 256 | 433.88 | 371.89 | 270 | 285.09 | 180.98 |
| nav | repo_map | 5 | 97.05 | 100.81 | 3 | 116.70 | 117.05 |
| long-horizon | find_code | 0 | — | — | 0 | — | — |
| long-horizon | repo_map | 7 | 615.61 | 453.86 | 8 | 337.17 | 350.31 |


## GW side-by-side — DESCRIPTIVE CROSS-ROUND

Change is100*(v8b/v7−1): negative means lower, unlike the within-round reduction sign. Different sessions, collection waves and agent strategies; not a causal product effect and not a pooled confirmatory comparison.

| Suite | GW metric | v7 mean | v8b mean | Change (new/old − 1) |
| --- | --- | --- | --- | --- |
| nav | Session elapsed/task (ms) | 6,350.47 | 6,321.17 | -0.5% |
| nav | Bytes/session | 34,914.25 | 33,048.69 | -5.3% |
| nav | Tool-side ms/session | 10,774.70 | 8,739.16 | -18.9% |
| nav | Calls/session | 60.00 | 62.50 | +4.2% |
| long-horizon | Session elapsed/task (ms) | 10,536.84 | 10,814.69 | +2.6% |
| long-horizon | Bytes/session | 6,858.38 | 6,774.69 | -1.2% |
| long-horizon | Tool-side ms/session | 1,253.07 | 1,561.25 | +24.6% |
| long-horizon | Calls/session | 17.25 | 17.56 | +1.8% |


### Baseline context (also descriptive)

Both arms were recollected. Baseline shifts and unrecorded provider/VM conditions prevent assigning cross-round movements solely to the product.

| Suite | Baseline metric | v7 mean | v8b mean | Change (new/old − 1) |
| --- | --- | --- | --- | --- |
| nav | Session elapsed/task (ms) | 5,341.10 | 5,349.62 | +0.2% |
| nav | Bytes/session | 33,383.56 | 34,848.31 | +4.4% |
| nav | Tool-side ms/session | 1,599.86 | 1,604.53 | +0.3% |
| long-horizon | Session elapsed/task (ms) | 9,836.58 | 9,308.21 | -5.4% |
| long-horizon | Bytes/session | 5,816.06 | 5,858.75 | +0.7% |
| long-horizon | Tool-side ms/session | 523.46 | 504.32 | -3.7% |


## Artifacts and checks

- v8b-build.log: pinned npm run build exited0.
- v8b-grade.log: unchanged pinned stable grader output, both suites.
- v8b-grade.mjs: exact analysis-only invocation with external destinations.
- v8b-inputs.py / v8b-report.py: reproducible provenance checks, tool aggregation, independent bootstrap validation, report.
- v8b-input-hashes.json:128 raw v7+v8b inputs, hashes rechecked after grading.
- v8b-session-metrics.csv, v8b-tool-totals.json, v8b-call-stats.json, v8b-lh-gw16-timing.json: full precision supporting data.
- Pinned graded JSON/MD/evidence: v8b-analysis/bench/{nav,long-horizon}/v7/results/.
- The analysis launched no benchmark sessions and did not change product, harness, grader or protocol code. This evidence-only publication adds the archived reports and results to README and the website; product changes remain off main.

## Publication interpretation

Tool-level find_code fell from 434 to 285ms mean per call and LH repo_map from 616 to 337ms, descriptively across rounds. End to end GroundWork remained significantly slower in both suites. Navigation's mean elapsed gap is 29.15s per session, compared with 7.13s of additional captured tool dispatch: 22.01s (75.5%) of the gap falls outside dispatch, in the agent-turn/inter-action portion of the envelope. That is a measured residual, not identified model thinking or provider latency. Both output CIs cross zero; neither suite meets the confirmatory latency-win rule. PR #39's fresh-root index cloning and bundled-service product changes were measured at 243bb54 and are not shipped on main.

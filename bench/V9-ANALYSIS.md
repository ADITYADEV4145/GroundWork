# Phase A v9/v9c — navigation results; long-horizon exploratory only

> Results-only publication of PR #41 measurements. **PR #41 was measured, not shipped.** This is not an overall Phase A pass: navigation engineering gates pass without a speed win; long-horizon has no confirmatory verdict. The report below is derived from the completed v9 analysis; references to no commit/push describe that analysis stage, not this publication.
>
> Repository evidence: [80 raw-input hashes and source URLs](V9-INPUTS.json); [official compliant navigation grade](nav/v9c/results/combined.json); [disclosed deviation navigation grade](nav/v9/results/combined.json); [EXPLORATORY ONLY long-horizon grade](long-horizon/v9/exploratory-results/combined.json). Full-precision action/mean bootstrap estimates are stored as `phase-a.json` alongside each grade. Original malformed LH raw data is retained, not normalized; normalization exists only in the clearly labeled exploratory grading evidence. Original host-local paths below are provenance references, not repository links.

## Status and scope

**Official compliant navigation engineering gate: PASS. Disclosed deviation navigation engineering gate: PASS.** Neither arm demonstrates a confirmatory latency improvement: both elapsed-time reduction intervals include zero and their point estimates are slower than baseline. These are navigation-only gate results, not an overall Phase A pass. **Long-horizon has NO confirmatory verdict: collection is incomplete under PROTOCOL.md.** Its separate results below are exploratory only and support no confirmatory claims.

48 unique navigation captures:16 shared v9 baseline,16 compliant v9c GroundWork,16 regenerated-skill deviation v9 GroundWork. Each comparison uses16 sessions/arm and30 tasks/session. The baseline is reused, not duplicated evidence; contrasts are not independent replications and GroundWork arms are never pooled. All32 LH exports remain retained for the specifically authorized exploratory calculation.

## Provenance and validation

```text
PASS 80/80 captures: captureRevision=36f54a0845fe2bf4184549cf5cef8f216a8957ab; stable-v1; correct suite/arm/run; complete fixed task manifests.
PASS nav v9:16 baseline +16 deviation GroundWork; nav v9c:16 compliant GroundWork; LH v9:16 baseline +16 GroundWork.
PASS all task/session/action timings finite, nonnegative and ordered; workspace-ready session envelopes; original bytes preserved.
NOTE exports have captureRevision, not a separate product-binary revision. Product=collector pin relies on the pinned same-checkout build instructions; independent binary provenance is not recorded.
PASS navigation schema:48/48;16 baseline +16 compliant GW +16 deviation GW; no normalization or exclusions.
FAIL original LH schema:lh9-groundwork-6, lh-09, tools[0].action="outline" (only mcp/shell/read accepted).
DECISION LH: incomplete collection per PROTOCOL.md; NO confirmatory Phase A verdict. Exploratory analysis only; original malformed action retained as one action with unchanged bytes and duration.
```

Raw archives and URL/local/archive/SHA-256 map: `/home/ubuntu/bench-diagnosis/v9-data/bench/` and `v9-data/input-manifest.json`. All80 original archives still match their source attachment bytes and saved hashes. Exports record default `Devin normal`, model `null`, Node `v24.22.2`; this is not independent provider/model attestation. Compliance labels come from the collection brief and frozen templates, not an exported skill hash. Product pin is inferred from frozen same-checkout build instructions, not an independent binary hash.

The isolated build `/home/ubuntu/bench-diagnosis/v9-36f54a0-build` is detached at `36f54a0845fe2bf4184549cf5cef8f216a8957ab`. Its unmodified pinned CLI completed both navigation grades during the original attempt; those successful reports are reused here rather than rerun. They are now archived under `bench/nav/{v9,v9c}/results/`. Only the separately labeled exploratory LH copy is adapted; no product, grader, capture, protocol or raw-export changes, commits or pushes.

## Method

Same stable-v1 session-primary estimators and acceptance graders as v7/v8. Session time/task = recorded workspace-ready init→last-finish envelope divided by30 (nav) or10 (LH), not sum of task windows. Bytes/session sums emitted captured UTF-8 tool output; tool-side ms/session sums captured action durationMs. Arithmetic arm means; independent whole-session bootstrap,10,000 draws, xorshift seed `0x51ab17ed`, nearest-rank sorted indices249/9749. Each metric resets the seed and draws16 baseline sessions then16 GroundWork sessions independently per iteration; run numbers are not pairs. Arm-mean intervals, GW-minus-baseline differences and percent reductions use the same draws. Reduction =100*(1−GW/B); positive favors GW. All six nav primary reduction intervals and adjusted bounds are independently reproduced from raw exports and matched to pinned-grader output.

**Turn definition:** one captured action, summed as `sum(len(o.tools) for o in capture.observations)`. This is v8b's calls/session diagnosis, not model conversation turns/provider calls. A batched query submitted through one wrapper action counts once; init/list/begin/finish/export and uncaptured agent activity do not count. All actions count regardless of success. Failures and costs are retained.

95% intervals below are nominal, not multiplicity-adjusted. Success guardrail is unchanged acceptance grading with no category losing GW successes. Equal success does not establish a correctness benefit. Bytes are not billed tokens or dollars.

## Navigation primary results

| Comparison | Metric | Baseline mean [95% CI] | GW mean [95% CI] | Reduction % [95% CI] | Success guardrail |
| --- | --- | --- | --- | --- | --- |
| Official nav: compliant v9c | Session elapsed/task (ms) | 5,701.72 [5,392.06, 6,017.37] | 5,782.44 [5,450.03, 6,120.39] | -1.42% [-9.81, 6.53] | Met; B 480/480, GW 480/480 |
| Official nav: compliant v9c | Emitted bytes/session | 32,680.50 [30,989.44, 34,529.88] | 34,459.38 [33,058.69, 36,297.88] | -5.44% [-13.59, 1.79] | Met; B 480/480, GW 480/480 |
| Official nav: compliant v9c | Tool-side ms/session | 1,501.69 [1,301.23, 1,743.69] | 7,336.66 [6,775.46, 7,935.68] | -388.56% [-475.34, -313.35] | Met; B 480/480, GW 480/480 |
| Deviation nav: regenerated skill v9 | Session elapsed/task (ms) | 5,701.72 [5,392.06, 6,017.37] | 6,005.23 [5,672.76, 6,333.41] | -5.32% [-13.94, 2.48] | Met; B 480/480, GW 480/480 |
| Deviation nav: regenerated skill v9 | Emitted bytes/session | 32,680.50 [30,989.44, 34,529.88] | 35,862.25 [34,183.06, 37,604.88] | -9.74% [-17.78, -2.07] | Met; B 480/480, GW 480/480 |
| Deviation nav: regenerated skill v9 | Tool-side ms/session | 1,501.69 [1,301.23, 1,743.69] | 7,895.47 [6,963.02, 9,153.06] | -425.77% [-545.32, -330.11] | Met; B 480/480, GW 480/480 |

## Navigation turns / captured actions

| Comparison | Baseline actions/session [95% CI] | GW actions/session [95% CI] | GW − B mean difference [95% CI] |
| --- | --- | --- | --- |
| Official nav: compliant v9c | 60.31 [58.06, 62.56] | 51.81 [50.19, 53.50] | -8.50 [-11.25, -5.69] |
| Deviation nav: regenerated skill v9 | 60.31 [58.06, 62.56] | 52.19 [50.44, 53.81] | -8.12 [-11.00, -5.44] |

## Navigation engineering gate

Preregistered Phase A engineering rule: mean GW actions/session ≤ baseline AND session-time reduction CI includes zero or is wholly favorable (upper endpoint ≥0). Success guardrails are reported alongside it and pass in both arms. A gate PASS is not a superiority claim and is not evidence of equivalence/noninferiority within a specified margin.

| Comparison | Mean turns ≤ baseline | Time CI includes zero or better | Success guardrail | Nav engineering gate |
| --- | --- | --- | --- | --- |
| Official nav: compliant v9c | PASS | PASS | Met | PASS |
| Deviation nav: regenerated skill v9 | PASS | PASS | Met | PASS |

The official arm is compliant v9c. The regenerated-skill v9 arm is a disclosed deviation and cannot replace the official result. Official time reduction is−1.42% [−9.81,6.53]; deviation is−5.32% [−13.94,2.48]. GroundWork uses fewer captured actions but is descriptively slower in both arms; intervals include zero. Official bytes are inconclusive; deviation emits significantly more bytes. Tool-side time is substantially higher in both arms. This does not identify provider latency or model thinking.

### Distinct stable-v1 confirmatory latency rule

The existing stable-v1 rule requires success guardrails and a strictly positive multiplicity-adjusted latency lower bound (index124:97.5% per suite for the original two-suite design). It is stricter than the plan's engineering gate; shown for continuity, not as a new route to a claim.

| Comparison | Adjusted time-reduction lower bound (97.5% per suite) | Stable-v1 confirmatory latency rule |
| --- | --- | --- |
| Official nav: compliant v9c | -10.90% | No confirmatory latency win |
| Deviation nav: regenerated skill v9 | -15.09% | No confirmatory latency win |

### Success by category

| Category | Shared baseline | Compliant v9c GW | Deviation v9 GW |
| --- | --- | --- | --- |
| locate | 208/208 | 208/208 | 208/208 |
| trace | 176/176 | 176/176 | 176/176 |
| fix | 48/48 | 48/48 | 48/48 |
| feature | 48/48 | 48/48 | 48/48 |

## EXPLORATORY long-horizon — NO confirmatory Phase A verdict

Collection is incomplete under PROTOCOL.md because `lh9-groundwork-6.json`, task `lh-09`, observation8/tool0 contains:

```json
{"action":"outline","bytes":30,"startedAt":1795336722121,"endedAt":1795336722122,"durationMs":0.06839899999999943}
```

The agent omitted the `mcp` subcommand and invoked `outline` as the wrapper action. The pinned wrapper's default dispatch raises `Unknown capture action`, catches it, emits `Error: Unknown capture action\n` (30 bytes), and still records the caller's action string. The exported `outline` action then fails the frozen schema (`mcp`/`shell`/`read` only). This is not a successful MCP outline call. The malformed record, its30-byte output and source dispatch are consistent with the stated cause; raw captures contain action metadata, not original command strings/output text, so those latter details are source-based reconstruction plus the supplied collection diagnosis, not independent transcript evidence.

As explicitly authorized, only `/home/ubuntu/bench-diagnosis/v9-exploratory-lh.mjs` adapts the **analysis copy**: `action=outline` becomes the schema's generic `shell` bucket, with `analysisOriginalAction=outline` and an explanatory annotation. This bucket is not a claim that a shell command or MCP tool executed. Every original action is retained exactly once; count, bytes, duration, timestamps, answers and patches are unchanged. The adapter asserts exactly one targeted replacement. Restoring its original action/removing the two annotations reproduces the complete original capture. Raw exports are immutable. The unmodified pinned grader supplies exploratory acceptance outcomes from these copies. Results live in `bench/long-horizon/v9/exploratory-results/`, never a confirmatory results directory.

| Comparison | Metric | Baseline mean [95% CI] | GW mean [95% CI] | Reduction % [95% CI] | Exploratory success check |
| --- | --- | --- | --- | --- | --- |
| EXPLORATORY LH only | Session elapsed/task (ms) | 9,738.61 [9,353.86, 10,137.28] | 11,303.73 [10,577.55, 12,031.22] | -16.07% [-25.07, -7.46] | Met; B 160/160, GW 160/160 |
| EXPLORATORY LH only | Emitted bytes/session | 5,627.19 [4,736.31, 6,501.56] | 7,017.44 [6,128.75, 8,005.62] | -24.71% [-54.00, -2.14] | Met; B 160/160, GW 160/160 |
| EXPLORATORY LH only | Tool-side ms/session | 559.80 [411.63, 801.46] | 1,554.04 [1,166.53, 2,021.09] | -177.60% [-330.25, -73.96] | Met; B 160/160, GW 160/160 |

| Comparison | Baseline actions/session [95% CI] | GW actions/session [95% CI] | GW − B mean difference [95% CI] |
| --- | --- | --- | --- |
| EXPLORATORY LH only | 19.56 [16.31, 23.25] | 18.31 [16.44, 20.44] | -1.25 [-5.38, 2.62] |

**No long-horizon gate verdict, confirmatory inference, product-performance claim or overall Phase A pass is made.** Exploratory CIs are descriptive and do not repair collection validity. No run is dropped/replaced. The original strict grader rejection remains documented in `v9-grade.log`.

## Reproduction and integrity

Analysis code: `/home/ubuntu/bench-diagnosis/v9-nav-report.py`; exploratory adapter: `v9-exploratory-lh.mjs`. Raw session metrics: `v9-data/session-metrics.csv`; full-precision bootstrap results: `v9-data/analysis.json`. The scripts check raw attachment hashes, report provenance, category guardrails, raw/grader mean agreement, all primary reduction intervals and turn totals. No changes to grader/capture/PROTOCOL.md and no commit/push.

# Phase B multi-turn reuse v1 — completed analysis

Phase B gate failed in both modes: neither arm produced detectable duplicated logic at turn 5 (0% vs 0%), so the primary metric could not show a GroundWork reduction.

## Publication archive

The analysis below is based on the completed local Phase B report; tables and the frozen outputs are unchanged. Portable committed evidence:

- [64 original raw captures](multiturn-reuse/v1/observations/), [input/artifact SHA-256 manifest](PHASEB-INPUTS.json).
- [Frozen grader records](multiturn-reuse/v1/results/records.json), [frozen analysis](multiturn-reuse/v1/results/analysis.json), [additional arm bootstrap intervals](multiturn-reuse/v1/results/bootstrap.json).
- [Provenance checks](multiturn-reuse/v1/results/provenance.txt), [all timing records](multiturn-reuse/v1/results/timing.json), [all workflow notes](multiturn-reuse/v1/results/workflow-notes.json), [full supplied workflow output](multiturn-reuse/v1/results/workflow-output.txt).

The split-product setup departs from the protocol's older "identical product pins" sentence; the explicitly approved pre-collection setup used separate products with one frozen collector. The fusion pytest-async GroundWork run 8 ran uncaptured read-only recovery checks, and several sessions had shell-quoting retries, all kept in.

Four never-started sessions were terminated and relaunched fresh on the same pins, with no data collected from the first attempts. The collection owner's lifecycle account is disclosed below alongside the timestamp evidence; no captured first attempt was dropped.

Reproduction must use the frozen grader checkout at `831fca40500094b904eb5078b5982884a057a439`, **not this publication HEAD**: the grader checks its own HEAD against captureRevision. After that checkout's documented dependency/repository setup, pass the absolute path of this archive's `bench/multiturn-reuse/v1/observations` as input and a fresh output directory. The original local paths later in this report document the actual analysis run; the links above are their committed equivalents.

## Verdict and scope

**The preregistered two-mode gate FAILS.** Normal and fusion both have turn-5 cumulative duplicated-logic rates of **0% in each arm**, baseline-minus-GroundWork difference **0.00 percentage points [0.00, 0.00]**. The required strictly positive lower bound is absent in both modes. Success guardrails are met everywhere: **80/80 turn acceptances per arm per mode**, 320/320 overall. No primary duplication reduction was demonstrated. The empirical zero-width interval reflects the detector's observed floor, not proof of universal equality or no possible effect.

The original 64 exports are preserved byte-for-byte. No capture, metric, threshold, grader or protocol was edited. During the original analysis no source-repository commits or pushes were made; this publication branch adds the preserved evidence and report. Frozen grade/analysis ran once, unchanged, at collector commit `831fca40500094b904eb5078b5982884a057a439`. These are real collected sessions, not synthetic calibration.

## Provenance and eligibility checks (before grading)

```text
PASS64/64 raw captures byte-identical to downloaded originals;64 unique labels and attachment URLs match the full workflow output;finished=5 each.
PASS64/64 collector=831fca40500094b904eb5078b5982884a057a439;suite=multiturn-reuse;stable-v1;workspace-ready;correct fixture revision, mode/chain/arm/run;320 complete ordered turns.
PASS64/64 workflow notes attest expected product pins:baseline=10fc7493ed024d817b5cabf7cbf4aaa97533825c;GroundWork=6fe635f586654359514c614402b0b0243c915b32;all collector pins agree.
PASS frozen captureSchema at831fca4:64 pass;0 fail (checked separately before this provenance pass).
PASS all session/turn/action timestamps finite, nonnegative, contained and serial;wallMs=end-start;no baseline MCP/blocked/hook spans.
PASS allocation:normal/fusion each16 baseline+16 GroundWork;four sessions/chain/arm/mode;no exports excluded, repaired or replaced by analysis.
NOTE product binaries are not independently attested in exports;product pins/build routing come from workflow registration and all64 agent notes. Mode names are capture metadata corroborated by the prepared workflow mode=mode dispatch, not independent provider telemetry.
NOTE schema validation does not establish correctness, absence of uncaptured activity, or hidden-test noninspection;all workflow notes are preserved for disclosure.
```

Source mapping: `phaseB-data/downloads.tsv`; supplied full workflow output: `phaseB-data/workflow-output.txt`, run `wfr-6ddd04278ae246719065199d61f1a453`. Raw and canonical hashes are distinct: `phaseB-data/validation/inputs.json` contains SHA-256 of original bytes; frozen `records.json` contains SHA-256 of JSON.stringify(parsed capture). All raw hashes were checked again after executing the submitted code during grading and still match both the manifest and downloaded originals. Capture/label metadata establishes the expected mode labels, not an independently audited provider/model identity; exports say model null and Node v24.22.2.

### Product pin registration caveat

The pre-collection workflow and explicit collection brief use the **same collector** in both arms, but separately built products: baseline main `10fc7493ed024d817b5cabf7cbf4aaa97533825c`, GroundWork PR #42 `6fe635f586654359514c614402b0b0243c915b32`. All 64 agent notes attest their assigned pins/build routing, consistent with workflow registration. Raw exports record `captureRevision`, not an independent product-binary hash; that stronger attestation cannot be reconstructed. The prepared workflow explicitly passes `mode=mode` and the capture labels agree, but the resumed workflow log is not independent mode telemetry.

`PROTOCOL-REUSE.md` still contains the earlier sentence that product/collector pins must be identical in both arms. The explicit approved pre-collection split-product setup superseded that product-pin arrangement; disclose this registration-text deviation rather than claiming literal unchanged product-pin conformance. Metrics, thresholds, resampling and gate below remain exactly the frozen definitions. The frozen analysis output's legacy field `collectorProductPin` is its grader checkout HEAD (`831fca4`), **not** either product binary revision.

## Method

64 independent chain-sessions: 16 baseline and 16 GroundWork in each of normal/fusion, balanced four per chain/arm/mode; five ordered turns each. No normal/fusion pooling, arbitrary run-number pairing or best-chain selection. Use arithmetic mean session rate within each chain and an equally weighted four-chain mean. This is not a ratio of pooled clone-token counts.

Frozen bootstrap: 10,000 independent whole-chain-session draws **within each chain and arm**, xorshift32 seed `0x51ab17ed`, reset per field/turn, sorted indices 249/9749. For each iteration draw all four baseline chain cells, then all four GroundWork cells, preserving the session's complete trajectory. All contrasts here are **baseline minus GroundWork**; rate differences use percentage points, growth differences use LOC. Positive duplication/growth differences favor GroundWork; negative reuse differences favor GroundWork. Arm-mean CIs are additional analysis-only summaries from those exact same frozen draws; every frozen curve's means and difference intervals were independently reproduced to tolerance 1e-12. No product/grader code changes were needed.

The primary is turn-5 cumulative duplicated introduced Python function-body tokens divided by cumulative introduced tokens, using the frozen 50-token contiguous-match threshold and union of repository/earlier-body coverage. All 320 snapshots have nonzero exposure, no empty-growth flag and no invalid AST sources; all duplicate numerators are zero, including repo and earlier-code components. This is **no detected qualifying clones**, not proof that every semantic duplication is absent. Renaming/literal normalization, static coverage and fixed thresholds have the documented limits; sub-threshold/restructured clones can be missed.

Reuse is AST/call-graph-resolved planted opportunities, not agent self-report or proof of dynamic execution. Current-turn reuse concerns that turn's entry point. All-opportunities-to-date reuse reevaluates every planted entry point so far in the current snapshot; it is not a running mean of old rates, and need not be monotone. Unsupported/dynamic/higher-order bindings can remain unresolved. Growth is current new-file nonblank Python LOC relative to the pinned repository; nonblank comments/docstrings count. `netAddedLoc` is the change from the preceding turn; `cumulativeLoc` is the net stock at this turn, not a sum counting unchanged lines repeatedly. Non-Python files are outside the token/LOC denominator but remain subject to patch-scope rules.

## Primary turn-5 outcome and gates

| Mode | Baseline rate % [95% CI] | GW rate % [95% CI] | B − GW pp [95% CI] | Success B / GW | Mode condition |
| --- | --- | --- | --- | --- | --- |
| normal | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 80/80 / 80/80; met | FAIL |
| fusion | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 80/80 / 80/80; met | FAIL |

Both mode conditions fail because the primary lower CI bound is 0, not strictly positive. The global gate is their conjunction and therefore **FAIL**, despite all success guardrails passing. Equal success is not a correctness win. No percent reduction is calculated from a zero baseline duplicate rate.

## Turn-5 secondary outcomes — nominal intervals, not a substitute for the failed primary gate

| Mode | Metric | Baseline mean [95% CI] | GW mean [95% CI] | B − GW [95% CI] |
| --- | --- | --- | --- | --- |
| normal | All-opportunities-to-date reuse (%) | 68.30 [58.48, 78.57] | 75.89 [66.52, 83.93] | -7.59 [-20.54, 5.80] |
| normal | Current-turn opportunity reuse (%) | 63.75 [55.00, 72.50] | 68.75 [61.25, 75.00] | -5.00 [-16.25, 7.50] |
| normal | Net nonblank Python LOC added | 83.06 [81.00, 85.12] | 73.06 [69.00, 78.75] | 10.00 [4.06, 14.75] |
| fusion | All-opportunities-to-date reuse (%) | 72.77 [68.30, 79.46] | 82.59 [75.00, 89.73] | -9.82 [-19.20, -0.45] |
| fusion | Current-turn opportunity reuse (%) | 68.75 [66.25, 72.50] | 76.25 [71.25, 82.50] | -7.50 [-13.75, -1.25] |
| fusion | Net nonblank Python LOC added | 69.69 [64.44, 74.75] | 65.88 [62.81, 68.44] | 3.81 [-2.06, 9.56] |

These secondary outcomes cannot substitute for the primary gate. Normal's reuse contrast includes zero, while its growth contrast favors lower GroundWork growth nominally; fusion's all-opportunities-to-date reuse contrast nominally favors GroundWork, while its growth contrast includes zero. These are secondary nominal intervals, not multiplicity-adjusted confirmatory wins or causal attribution to session-memory feedback.

## Every chain: turn-5 numerators, denominators and growth

There are four sessions in every cell. Token totals are shown as exposure denominators, not used to replace the preregistered mean-of-session-rates estimator. Opportunity totals likewise accompany the static rates; the full per-session numerators and denominators are in `phaseB-grader-output/records.json`.

| Mode | Chain | B duplicate/introduced tokens | GW duplicate/introduced tokens | B reused/opportunities | GW reused/opportunities | B mean net LOC | GW mean net LOC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| normal | click-summary | 0/1662 | 0/1608 | 32/56 | 47/56 | 88.00 | 70.00 |
| normal | click-values | 0/1574 | 0/1599 | 53/56 | 52/56 | 74.75 | 67.50 |
| normal | pytest-escape | 0/1716 | 0/1694 | 47/56 | 47/56 | 84.75 | 69.75 |
| normal | pytest-async | 0/1733 | 0/1677 | 21/56 | 24/56 | 84.75 | 85.00 |
| fusion | click-summary | 0/1627 | 0/1570 | 37/56 | 42/56 | 78.00 | 73.50 |
| fusion | click-values | 0/1559 | 0/1520 | 52/56 | 53/56 | 61.00 | 62.75 |
| fusion | pytest-escape | 0/1639 | 0/1653 | 42/56 | 47/56 | 71.75 | 65.50 |
| fusion | pytest-async | 0/1635 | 0/1567 | 32/56 | 43/56 | 68.00 | 61.75 |

## Per-turn curves, all means and nominal 95% CIs

### normal

| Turn | Metric | Baseline mean [95% CI] | GroundWork mean [95% CI] | B − GW [95% CI] |
| --- | --- | --- | --- | --- |
| 1 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 1 | All-opportunities-to-date reuse (%) | 50.00 [37.50, 62.50] | 62.50 [43.75, 75.00] | -12.50 [-31.25, 6.25] |
| 1 | Current-turn opportunity reuse (%) | 50.00 [37.50, 62.50] | 62.50 [43.75, 75.00] | -12.50 [-31.25, 6.25] |
| 1 | Net nonblank Python LOC added | 36.62 [35.12, 38.19] | 32.25 [31.12, 33.38] | 4.38 [2.44, 6.31] |
| 2 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 2 | All-opportunities-to-date reuse (%) | 62.50 [50.00, 75.00] | 72.92 [62.50, 83.33] | -10.42 [-25.00, 6.25] |
| 2 | Current-turn opportunity reuse (%) | 68.75 [59.38, 81.25] | 78.12 [68.75, 87.50] | -9.38 [-25.00, 6.25] |
| 2 | Net nonblank Python LOC added | 51.94 [50.56, 53.31] | 45.81 [44.19, 47.50] | 6.12 [3.94, 8.25] |
| 3 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 3 | All-opportunities-to-date reuse (%) | 68.75 [59.38, 81.25] | 78.12 [68.75, 87.50] | -9.38 [-25.00, 6.25] |
| 3 | Current-turn opportunity reuse (%) | 75.00 [64.58, 85.42] | 83.33 [72.92, 91.67] | -8.33 [-22.92, 6.25] |
| 3 | Net nonblank Python LOC added | 60.50 [59.19, 61.81] | 53.38 [51.19, 55.88] | 7.12 [4.25, 9.69] |
| 4 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 4 | All-opportunities-to-date reuse (%) | 70.83 [61.11, 82.64] | 79.86 [70.14, 88.89] | -9.03 [-23.61, 6.25] |
| 4 | Current-turn opportunity reuse (%) | 75.00 [64.58, 85.42] | 83.33 [72.92, 91.67] | -8.33 [-22.92, 6.25] |
| 4 | Net nonblank Python LOC added | 68.88 [67.44, 70.19] | 60.69 [57.38, 65.12] | 8.19 [3.56, 11.81] |
| 5 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 5 | All-opportunities-to-date reuse (%) | 68.30 [58.48, 78.57] | 75.89 [66.52, 83.93] | -7.59 [-20.54, 5.80] |
| 5 | Current-turn opportunity reuse (%) | 63.75 [55.00, 72.50] | 68.75 [61.25, 75.00] | -5.00 [-16.25, 7.50] |
| 5 | Net nonblank Python LOC added | 83.06 [81.00, 85.12] | 73.06 [69.00, 78.75] | 10.00 [4.06, 14.75] |

### fusion

| Turn | Metric | Baseline mean [95% CI] | GroundWork mean [95% CI] | B − GW [95% CI] |
| --- | --- | --- | --- | --- |
| 1 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 1 | All-opportunities-to-date reuse (%) | 43.75 [31.25, 62.50] | 68.75 [50.00, 87.50] | -25.00 [-50.00, 0.00] |
| 1 | Current-turn opportunity reuse (%) | 43.75 [31.25, 62.50] | 68.75 [50.00, 87.50] | -25.00 [-50.00, 0.00] |
| 1 | Net nonblank Python LOC added | 29.56 [26.06, 32.81] | 28.00 [25.62, 30.00] | 1.56 [-2.56, 5.56] |
| 2 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 2 | All-opportunities-to-date reuse (%) | 62.50 [54.17, 75.00] | 79.17 [66.67, 91.67] | -16.67 [-33.33, 0.00] |
| 2 | Current-turn opportunity reuse (%) | 71.88 [65.62, 81.25] | 84.38 [75.00, 93.75] | -12.50 [-25.00, 0.00] |
| 2 | Net nonblank Python LOC added | 43.75 [39.94, 47.25] | 41.31 [39.00, 43.25] | 2.44 [-1.94, 6.56] |
| 3 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 3 | All-opportunities-to-date reuse (%) | 71.88 [65.62, 81.25] | 84.38 [75.00, 93.75] | -12.50 [-25.00, 0.00] |
| 3 | Current-turn opportunity reuse (%) | 81.25 [77.08, 87.50] | 89.58 [83.33, 95.83] | -8.33 [-16.67, 0.00] |
| 3 | Net nonblank Python LOC added | 51.31 [47.12, 55.25] | 48.44 [46.00, 50.44] | 2.88 [-1.88, 7.44] |
| 4 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 4 | All-opportunities-to-date reuse (%) | 75.00 [69.44, 83.33] | 86.11 [77.78, 94.44] | -11.11 [-22.22, 0.00] |
| 4 | Current-turn opportunity reuse (%) | 81.25 [77.08, 87.50] | 89.58 [83.33, 95.83] | -8.33 [-16.67, 0.00] |
| 4 | Net nonblank Python LOC added | 57.81 [53.06, 62.44] | 54.56 [51.88, 56.81] | 3.25 [-2.06, 8.50] |
| 5 | Cumulative duplicated-logic rate (%) | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 5 | All-opportunities-to-date reuse (%) | 72.77 [68.30, 79.46] | 82.59 [75.00, 89.73] | -9.82 [-19.20, -0.45] |
| 5 | Current-turn opportunity reuse (%) | 68.75 [66.25, 72.50] | 76.25 [71.25, 82.50] | -7.50 [-13.75, -1.25] |
| 5 | Net nonblank Python LOC added | 69.69 [64.44, 74.75] | 65.88 [62.81, 68.44] | 3.81 [-2.06, 9.56] |

## Success guardrail at every chain and turn

Each cell is baseline successful sessions / four versus GroundWork successful sessions / four. Guardrail requires GW count ≥ baseline at every chain/turn within both modes. Every one of the 40 checks passes; all 320 acceptance results pass and no acceptance error or analysis exception occurred.

| Mode | Chain | Turn 1 B / GW | Turn 2 B / GW | Turn 3 B / GW | Turn 4 B / GW | Turn 5 B / GW | Guardrail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| normal | click-summary | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |
| normal | click-values | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |
| normal | pytest-escape | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |
| normal | pytest-async | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |
| fusion | click-summary | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |
| fusion | click-values | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |
| fusion | pytest-escape | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |
| fusion | pytest-async | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | 4/4 / 4/4 | met |

## Four relaunched units: timestamp audit

The supplied resumed workflow log replays 60 recorded results and starts/completes these four sessions. The collection owner reports the first attempts never started and produced no captures; only the finished attachment for each planned label is present. We did not drop a captured first attempt or substitute based on outcomes. The log and supplied files do not independently reconstruct the earlier failed-launch lifecycle.

Times below are UTC from recorded capture fields. Every rerun has five distinct positive-duration turns, ordered action spans, and incremental patches, not placeholder/zero-duration turns. There is no minimum-duration exclusion in the protocol. Two GW reruns are faster than the other three sessions in their exact mode/chain/arm cell, but all four fall within their mode/arm's observed session-duration range. That is a descriptive comparison, not a new inclusion cutoff or proof of authenticity. Around five minutes of outer workflow time is not the stable-v1 session measure: the latter excludes pre-init provisioning/build/setup. The unmeasured difference cannot be assigned exactly to setup versus other overhead from these exports.

| Unit | Session start UTC | Session end UTC | Session seconds | Turn 1–5 seconds | Other 3 same-cell sessions min/median/max seconds | Captured actions |
| --- | --- | --- | --- | --- | --- | --- |
| reuse-fusion-click-summary-groundwork-5 | 2026-11-22T13:18:15.085Z | 2026-11-22T13:19:39.698Z | 84.613 | 19.928, 16.417, 7.696, 8.200, 14.004 | 100.165 / 104.720 / 104.744 | 19 |
| reuse-normal-click-values-groundwork-2 | 2026-11-22T13:18:18.973Z | 2026-11-22T13:20:00.776Z | 101.803 | 23.530, 23.829, 11.047, 11.191, 15.873 | 110.762 / 115.997 / 145.760 | 20 |
| reuse-normal-click-values-baseline-2 | 2026-11-22T13:18:17.502Z | 2026-11-22T13:20:17.744Z | 120.242 | 53.711, 17.602, 11.066, 10.265, 11.607 | 89.167 / 120.130 / 132.499 | 9 |
| reuse-fusion-pytest-async-groundwork-16 | 2026-11-22T13:18:18.540Z | 2026-11-22T13:20:19.842Z | 121.302 | 31.394, 13.887, 12.018, 12.798, 18.521 | 99.568 / 100.482 / 157.818 | 23 |

### Rerun turn timestamps and patch exposure

| Unit | Turn | Start UTC | End UTC | Seconds | Actions | Incremental patch UTF-8 bytes |
| --- | --- | --- | --- | --- | --- | --- |
| reuse-fusion-click-summary-groundwork-5 | 1 | 2026-11-22T13:18:22.885Z | 2026-11-22T13:18:42.813Z | 19.928 | 5 | 1616 |
| reuse-fusion-click-summary-groundwork-5 | 2 | 2026-11-22T13:18:45.553Z | 2026-11-22T13:19:01.970Z | 16.417 | 5 | 898 |
| reuse-fusion-click-summary-groundwork-5 | 3 | 2026-11-22T13:19:04.439Z | 2026-11-22T13:19:12.135Z | 7.696 | 3 | 728 |
| reuse-fusion-click-summary-groundwork-5 | 4 | 2026-11-22T13:19:14.763Z | 2026-11-22T13:19:22.963Z | 8.200 | 3 | 766 |
| reuse-fusion-click-summary-groundwork-5 | 5 | 2026-11-22T13:19:25.672Z | 2026-11-22T13:19:39.676Z | 14.004 | 3 | 1399 |
| reuse-normal-click-values-groundwork-2 | 1 | 2026-11-22T13:18:22.033Z | 2026-11-22T13:18:45.563Z | 23.530 | 6 | 1789 |
| reuse-normal-click-values-groundwork-2 | 2 | 2026-11-22T13:18:50.555Z | 2026-11-22T13:19:14.384Z | 23.829 | 5 | 1325 |
| reuse-normal-click-values-groundwork-2 | 3 | 2026-11-22T13:19:17.245Z | 2026-11-22T13:19:28.292Z | 11.047 | 3 | 1075 |
| reuse-normal-click-values-groundwork-2 | 4 | 2026-11-22T13:19:30.804Z | 2026-11-22T13:19:41.995Z | 11.191 | 3 | 1125 |
| reuse-normal-click-values-groundwork-2 | 5 | 2026-11-22T13:19:44.877Z | 2026-11-22T13:20:00.750Z | 15.873 | 3 | 1756 |
| reuse-normal-click-values-baseline-2 | 1 | 2026-11-22T13:18:20.640Z | 2026-11-22T13:19:14.351Z | 53.711 | 4 | 1897 |
| reuse-normal-click-values-baseline-2 | 2 | 2026-11-22T13:19:18.083Z | 2026-11-22T13:19:35.685Z | 17.602 | 2 | 1838 |
| reuse-normal-click-values-baseline-2 | 3 | 2026-11-22T13:19:38.506Z | 2026-11-22T13:19:49.572Z | 11.066 | 1 | 1447 |
| reuse-normal-click-values-baseline-2 | 4 | 2026-11-22T13:19:52.469Z | 2026-11-22T13:20:02.734Z | 10.265 | 1 | 1587 |
| reuse-normal-click-values-baseline-2 | 5 | 2026-11-22T13:20:06.121Z | 2026-11-22T13:20:17.728Z | 11.607 | 1 | 1511 |
| reuse-fusion-pytest-async-groundwork-16 | 1 | 2026-11-22T13:18:21.679Z | 2026-11-22T13:18:53.073Z | 31.394 | 7 | 1128 |
| reuse-fusion-pytest-async-groundwork-16 | 2 | 2026-11-22T13:19:00.284Z | 2026-11-22T13:19:14.171Z | 13.887 | 4 | 870 |
| reuse-fusion-pytest-async-groundwork-16 | 3 | 2026-11-22T13:19:21.159Z | 2026-11-22T13:19:33.177Z | 12.018 | 4 | 676 |
| reuse-fusion-pytest-async-groundwork-16 | 4 | 2026-11-22T13:19:39.749Z | 2026-11-22T13:19:52.547Z | 12.798 | 4 | 700 |
| reuse-fusion-pytest-async-groundwork-16 | 5 | 2026-11-22T13:20:01.280Z | 2026-11-22T13:20:19.801Z | 18.521 | 4 | 1304 |

All action spans are contained and serial. The maximum absolute difference between epoch-span milliseconds and monotonic duration is 11.437ms; the frozen schema does not require those independent clocks to have identical deltas. Nothing was rounded, repaired or excluded from inputs; displayed decimals are formatting only.

## Costs (descriptive, not alternate endpoints)

| Mode | Arm | Mean session seconds | Mean tool-side ms/session | Mean emitted bytes/session | Mean captured actions/session |
| --- | --- | --- | --- | --- | --- |
| normal | baseline | 115.11 | 1712.28 | 7080.06 | 10.44 |
| normal | groundwork | 120.43 | 16333.52 | 6362.44 | 20.56 |
| fusion | baseline | 100.62 | 1482.51 | 4396.06 | 8.75 |
| fusion | groundwork | 107.14 | 14988.83 | 5111.62 | 20.00 |

Requirements/list/begin/finish/export are not agent conversation turns. Prompt/Stop hooks are instrumented shell action spans. All 32 GroundWork sessions have five `hook:prompt` and five `hook:stop` spans (160 of each overall); baseline has none. Captured hook spans prove instrumented dispatch, not independently that every product hook succeeded or that session-memory suggestions changed behavior. The hooks fail open; outputs and product ledgers are not archived as independent event traces.

## Execution deviations and audit limits

All 64 full notes are retained in `phaseB-data/validation/workflow-notes.json` alongside the original workflow output. They describe repeated shell quoting/f-string failures repaired within turns, wrong-argument MCP retries, TTY truncation/cancellation, env/cwd loss and failed begin/setup-shell invocations. Failed captured calls retain their costs; work before a wrapper invocation is not reconstructed as a tool cost. No hidden-test/manifest inspection or cross-context sharing is reported in those notes; captures do not contain full command text or agent transcripts, so absence cannot be independently proved from this archive.

Explicit unwrapped activity: fusion pytest-async GroundWork run 8 reports uncaptured read-only `ls/find/git status` checks of capture/workspace paths after a TTY-truncated write; retain and disclose it, do not silently exclude. Fusion pytest-async baseline run 8 reports stray uncaptured no-op/syntax-error shell fragments while repairing a truncated write, with workspace edits through wrappers. Normal click-summary baseline 1 and normal click-values baseline 2 similarly report shell-quote fragments escaping the intended wrapper command, followed by captured repair; they report no resulting out-of-workspace writes. Other begin/setup failures and an external env helper (normal click-summary baseline 9) are described in the original notes. This is not a perfectly uniform execution sample.

Captured MCP tool names/counts: `{'find_code': 23, 'read_symbol': 44}`. There are no captured `find_similar` or `verify_calls` calls; agents commonly report established canonical targets and reuse/extension rather than new cross-file targets. That self-report does not establish universal compliance with every reuse-first instruction. No baseline MCP/blocked/hook span occurs; shell command text is not retained, so covert treatment use cannot be independently ruled out solely from action labels.


## Reproduction and outputs

```sh
# Unmodified checkout at831fca40500094b904eb5078b5982884a057a439
node scripts/bench-multiturn-reuse.mjs   /home/ubuntu/bench-diagnosis/phaseB-data   /home/ubuntu/bench-diagnosis/phaseB-grader-output
```

The grading process applies each incremental patch to a clean pinned upstream repository, enforces patch scope, runs hidden acceptance per turn, and executes the frozen static grader. Temporary benchmark-owned Git snapshots are internal grading mechanics, not commits to the source repository. It completed with exit 0. Outputs: `phaseB-grader-output/records.json`, `analysis.json`; full stdout `phaseB-grader.log`. Additional arm-CI/current-turn summaries: `phaseB-analysis.json`; audit scripts: `phaseB-provenance.py`, `phaseB-report.py`. The raw input directory still has exactly the 64 submitted JSON files at its root; validation artifacts are isolated under `validation/`.

No billed-token/dollar claim, no causal decomposition of thinking/provider time, and no overall reuse/duplication win is supported by these results.

# v10 publication: engineering gates, not a speed win

The navigation engineering gate passed on fewer actions, in both official and disclosed deviation arms. There is no speed win: navigation session-time intervals cross zero, and navigation tool-side time is about 5x baseline (5.66x official; 5.57x disclosed deviation). The LH disclosed deviation also passed its engineering gate; its session-time interval crosses zero.

Official long-horizon has no confirmatory verdict. The rejected capture v10-lh-groundwork-11, task lh-04, action "outline", is disclosed unchanged. EXPLORATORY ONLY: a separate analysis copy maps that one rejected action to the shell schema bucket, not an executed shell, retaining its count, 30 bytes, 0.07910900000001675 ms and timestamps. Exploratory official LH numbers support no publication claim and never replace official results.

18 never-started sessions across 17 units were terminated and relaunched; no data was collected from those attempts. Official nav baseline run 10 required two terminations. Final completed exports are all retained, including the schema-rejected official LH capture.

The capture.mjs root cause is in the capture harness, not product outline: an unknown subcommand falls through dispatch, then its caught error is recorded with action=argv[0], outside the schema enum. The written proposal is for a future pre-registered run only: reject unknown wrapper verbs before recording, with an explicit policy for failed-attempt counts and timing. No capture.mjs, schema, grader or PROTOCOL.md change is included.

Repository evidence: [inputs/hashes](V10-INPUTS.json), [pre-collection arms](V10-ARMS-NOTE.md), [per-tool tables](v10/results/per-tool.md), [bootstrap snapshots](v10/results/analysis.json), [official navigation](nav/v10/results/combined.json), [deviation navigation](nav/v10d/results/combined.json), [deviation LH](long-horizon/v10d/results/combined.json), and [exploratory official LH](long-horizon/v10/exploratory-results/combined.json).

The full external analysis below is preserved verbatim. Its local filesystem paths identify original analysis artifacts; use the repository links above for published copies. Statements about no source commits or pushes describe the analysis stage, before this evidence/documentation publication.

<!-- v10-analysis-source:start -->
# v10 Phase A analysis — navigation, disclosed deviations and exploratory official LH

## Status and authorization

The initial validation STOP was honored. Subsequent authorization allowed the48 valid navigation captures to be graded, the valid LH deviation arm to be graded against its baseline, and official LH to be analyzed **EXPLORATORILY ONLY**, using exactly the v9 analysis-only normalization. **Official LH has no confirmatory verdict.** Its original run11 capture still fails the frozen schema and is unchanged on disk. No schema, grader, harness or protocol modification. No source commits or pushes.

All four contrasts below use the unmodified grader at PR #48 `e3bdc7401daf7264b242b32a2d7bc4de09178f69`. Every contrast includes16 baseline+16 GW whole sessions. Navigation and LH each reuse their own baseline in two comparisons; the baseline is not duplicated as independent evidence and GW arms are never pooled.

## Method — unchanged v9 stable-v1 estimands

Session elapsed/task is `(sessionEndedAt-sessionStartedAt)/task count`, with workspace-ready init-to-last-finish timing;30 nav tasks or10 sequential LH steps. Emitted bytes and tool-side milliseconds are sums across captured actions per session. Actions/session is `sum(len(observation.tools))`, not an LLM conversation turn. Errors and empty outputs remain counted. Bootstrap:10,000 independent whole-session draws per arm; xorshift32 seed `0x51ab17ed` reset per metric; indices249/9749; no pairing of run labels. Tables show arm means and nominal95% CIs. Reduction is `100*(1-GW/B)`; positive favors GW. Action differences are GW−B; negative favors GW.

The engineering gate requires all three: mean GW actions/session ≤ baseline; session-time reduction CI upper endpoint ≥0 (includes zero or wholly favorable); no category with fewer GW successes. Gate passage is not superiority, equivalence or proof of a speed win. Bytes are emitted tool output, not provider-billed tokens or dollar savings. Tool-side time is not provider/model-thinking time. Full-session bootstrap does not quantify unobserved wave/project variance.

## Navigation — official and disclosed deviation

| Comparison | Metric | Baseline mean [95% CI] | GW mean [95% CI] | Reduction % [95% CI] |
| --- | --- | --- | --- | --- |
| Navigation official compliant | Session elapsed/task (ms) | 5,668.09 [5,387.28, 5,932.09] | 5,445.73 [5,104.14, 5,819.07] | 3.92 [-4.43, 11.31] |
| Navigation official compliant | Emitted bytes/session | 32,401.62 [30,830.25, 34,215.00] | 33,028.19 [32,008.69, 34,145.56] | -1.93 [-8.26, 4.23] |
| Navigation official compliant | Tool-side ms/session | 1,315.68 [1,202.59, 1,422.60] | 7,445.79 [6,871.66, 8,101.05] | -465.93 [-540.05, -405.27] |
| Navigation disclosed deviation | Session elapsed/task (ms) | 5,668.09 [5,387.28, 5,932.09] | 5,959.93 [5,654.53, 6,274.32] | -5.15 [-13.10, 1.98] |
| Navigation disclosed deviation | Emitted bytes/session | 32,401.62 [30,830.25, 34,215.00] | 35,947.62 [33,660.69, 38,267.50] | -10.94 [-20.11, -2.04] |
| Navigation disclosed deviation | Tool-side ms/session | 1,315.68 [1,202.59, 1,422.60] | 7,328.08 [6,659.48, 7,993.27] | -456.98 [-531.10, -390.89] |

| Comparison | Baseline actions/session [95% CI] | GW actions/session [95% CI] | GW − B difference [95% CI] |
| --- | --- | --- | --- |
| Navigation official compliant | 57.12 [54.44, 59.69] | 50.31 [49.06, 51.75] | -6.81 [-9.75, -3.69] |
| Navigation disclosed deviation | 57.12 [54.44, 59.69] | 52.62 [50.06, 55.44] | -4.50 [-8.25, -0.62] |

| Comparison | B task success | B all-task sessions | GW task success | GW all-task sessions | Category guardrail |
| --- | --- | --- | --- | --- | --- |
| Navigation official compliant | 480/480 | 16/16 | 480/480 | 16/16 | Met |
| Navigation disclosed deviation | 480/480 | 16/16 | 480/480 | 16/16 | Met |

| Comparison | Actions ≤ baseline | Time CI zero or better | Success guardrail | Engineering gate |
| --- | --- | --- | --- | --- |
| Navigation official compliant | Yes | Yes | Met | PASS |
| Navigation disclosed deviation | Yes | Yes | Met | PASS |

## Long-horizon — valid disclosed deviation

The16 deviation GW exports and16 shared baseline exports pass the frozen schema; no normalization is used for this comparison. It is a disclosed regenerated-skill prompt deviation, not a replacement for the invalid official comparison.

| Comparison | Metric | Baseline mean [95% CI] | GW mean [95% CI] | Reduction % [95% CI] |
| --- | --- | --- | --- | --- |
| LH disclosed deviation | Session elapsed/task (ms) | 9,418.56 [8,800.72, 10,094.75] | 10,215.93 [9,539.82, 10,972.81] | -8.47 [-19.87, 1.55] |
| LH disclosed deviation | Emitted bytes/session | 5,149.94 [4,526.12, 5,680.31] | 6,333.25 [5,433.75, 7,080.38] | -22.98 [-45.58, -2.43] |
| LH disclosed deviation | Tool-side ms/session | 506.18 [400.55, 653.58] | 1,242.24 [1,057.86, 1,444.72] | -145.42 [-225.64, -81.75] |

| Comparison | Baseline actions/session [95% CI] | GW actions/session [95% CI] | GW − B difference [95% CI] |
| --- | --- | --- | --- |
| LH disclosed deviation | 17.44 [14.56, 20.75] | 17.31 [16.00, 19.00] | -0.12 [-3.75, 3.19] |

| Comparison | B task success | B all-task sessions | GW task success | GW all-task sessions | Category guardrail |
| --- | --- | --- | --- | --- | --- |
| LH disclosed deviation | 160/160 | 16/16 | 160/160 | 16/16 | Met |

| Comparison | Actions ≤ baseline | Time CI zero or better | Success guardrail | Engineering gate |
| --- | --- | --- | --- | --- |
| LH disclosed deviation | Yes | Yes | Met | PASS |

## EXPLORATORY ONLY — official long-horizon

**No confirmatory verdict, regardless of the following values.** Raw `v10-lh-groundwork-11.json`, task `lh-04`, remains rejected because `observations[3].tools[0].action` is `outline`. Following the explicitly authorized v9 exploratory method, only a separate analysis copy changes that one action to the existing `shell` schema bucket and annotates `analysisOriginalAction`/`analysisNormalization`. This is **not an executed shell or product MCP call**. Its action count (one),30 bytes,0.07910900000001675 ms and all timestamps remain intact. Reverse-normalization deep equality checks establish no unrelated field changes. All32 sessions are retained; no dropped task, run, bytes or time. Cost estimates are computed from raw captures and cross-checked against the normalized-input grader outputs.

| Comparison | Metric | Baseline mean [95% CI] | GW mean [95% CI] | Reduction % [95% CI] |
| --- | --- | --- | --- | --- |
| EXPLORATORY official LH | Session elapsed/task (ms) | 9,418.56 [8,800.72, 10,094.75] | 10,371.71 [9,790.23, 10,937.46] | -10.12 [-20.21, -0.79] |
| EXPLORATORY official LH | Emitted bytes/session | 5,149.94 [4,526.12, 5,680.31] | 6,298.06 [5,629.06, 6,851.50] | -22.29 [-43.04, -5.28] |
| EXPLORATORY official LH | Tool-side ms/session | 506.18 [400.55, 653.58] | 1,304.47 [1,109.20, 1,514.93] | -157.71 [-243.83, -90.61] |

| Comparison | Baseline actions/session [95% CI] | GW actions/session [95% CI] | GW − B difference [95% CI] |
| --- | --- | --- | --- |
| EXPLORATORY official LH | 17.44 [14.56, 20.75] | 17.44 [16.25, 18.81] | 0.00 [-3.50, 3.19] |

| Comparison | B task success | B all-task sessions | GW task success | GW all-task sessions | Category guardrail |
| --- | --- | --- | --- | --- | --- |
| EXPLORATORY official LH | 160/160 | 16/16 | 160/160 | 16/16 | Met |

| Comparison | Actions ≤ baseline | Time CI zero or better | Success guardrail | Engineering gate |
| --- | --- | --- | --- | --- |
| EXPLORATORY official LH | Yes | No | Met | NO CONFIRMATORY VERDICT |

The component checks are descriptive only; they do not restore eligibility or turn this into an official gate result.

## LH per-task actions — total across16 sessions (mean/session)

These counts come from the unmodified raw exports, including the rejected official lh-04 call once. The official GW column is exploratory; baseline is shared, not an additional independent arm.

| Task | Baseline total (mean) | EXPLORATORY official GW total (mean) | Disclosed deviation GW total (mean) |
| --- | --- | --- | --- |
| lh-01 | 100 (6.25) | 97 (6.06) | 101 (6.31) |
| lh-02 | 19 (1.19) | 20 (1.25) | 21 (1.31) |
| lh-03 | 28 (1.75) | 32 (2.00) | 23 (1.44) |
| lh-04 | 20 (1.25) | 20 (1.25) | 20 (1.25) |
| lh-05 | 18 (1.12) | 18 (1.12) | 19 (1.19) |
| lh-06 | 18 (1.12) | 19 (1.19) | 18 (1.12) |
| lh-07 | 18 (1.12) | 19 (1.19) | 20 (1.25) |
| lh-08 | 21 (1.31) | 19 (1.19) | 18 (1.12) |
| lh-09 | 18 (1.12) | 17 (1.06) | 17 (1.06) |
| lh-10 | 19 (1.19) | 18 (1.12) | 20 (1.25) |

## Per-tool breakdown — all captured calls

Calls and bytes below are totals across16 sessions per row's arm. Durations are per-call milliseconds, not wall-clock session latency. MCP is split by the wrapper's requested tool name; these rows are captured attempts, not proof of successful product execution. The3 nav-deviation `mcp:read_symbols` attempts are schema-valid failed calls: the wrapper rejects that unlisted tool name before product dispatch, retaining their counts,300 bytes and durations. Failed and empty calls remain included. Official LH's malformed call is shown separately, not misclassified as a real shell/MCP execution. `/home/ubuntu/bench-diagnosis/v10-per-tool.md` additionally gives first/later-within-task rows, calls/session, tool ms/session and bytes/session, following the v9 per-tool format.

| Suite / arm | Tool | Calls | Mean ms | Median ms | Bytes total |
| --- | --- | --- | --- | --- | --- |
| nav — baseline | read | 418 | 0.42 | 0.31 | 278254 |
| nav — baseline | shell | 496 | 42.08 | 8.02 | 240172 |
| nav — official GW | mcp:callees | 1 | 68.04 | 68.04 | 178 |
| nav — official GW | mcp:callers | 22 | 209.26 | 99.98 | 3190 |
| nav — official GW | mcp:find_code | 255 | 282.63 | 184.79 | 330787 |
| nav — official GW | mcp:outline | 32 | 81.80 | 78.41 | 26844 |
| nav — official GW | mcp:read_symbol | 38 | 93.90 | 90.18 | 16047 |
| nav — official GW | mcp:repo_map | 3 | 100.36 | 97.35 | 168 |
| nav — official GW | read | 161 | 116.74 | 102.08 | 63446 |
| nav — official GW | shell | 293 | 58.38 | 9.71 | 87791 |
| nav — disclosed deviation GW | mcp:callers | 12 | 85.86 | 82.19 | 1904 |
| nav — disclosed deviation GW | mcp:find_code | 267 | 268.12 | 177.23 | 315047 |
| nav — disclosed deviation GW | mcp:outline | 55 | 89.55 | 87.05 | 40963 |
| nav — disclosed deviation GW | mcp:read_symbol | 114 | 89.91 | 85.48 | 88922 |
| nav — disclosed deviation GW | mcp:read_symbols | 3 | 0.18 | 0.16 | 300 |
| nav — disclosed deviation GW | mcp:repo_map | 7 | 107.10 | 106.63 | 399 |
| nav — disclosed deviation GW | read | 104 | 114.23 | 111.80 | 42941 |
| nav — disclosed deviation GW | shell | 280 | 60.09 | 8.56 | 84686 |
| long-horizon — baseline | read | 63 | 0.31 | 0.28 | 21887 |
| long-horizon — baseline | shell | 216 | 37.40 | 31.51 | 60512 |
| long-horizon — EXPLORATORY official GW | invalid-wrapper:outline | 1 | 0.08 | 0.08 | 30 |
| long-horizon — EXPLORATORY official GW | mcp:find_similar | 10 | 161.98 | 131.57 | 120 |
| long-horizon — EXPLORATORY official GW | mcp:outline | 21 | 232.58 | 249.47 | 11643 |
| long-horizon — EXPLORATORY official GW | mcp:read_symbol | 22 | 164.17 | 91.52 | 35168 |
| long-horizon — EXPLORATORY official GW | mcp:repo_map | 8 | 304.09 | 284.99 | 768 |
| long-horizon — EXPLORATORY official GW | mcp:verify_calls | 1 | 131.45 | 131.45 | 3 |
| long-horizon — EXPLORATORY official GW | read | 3 | 131.66 | 114.82 | 360 |
| long-horizon — EXPLORATORY official GW | shell | 213 | 36.60 | 32.78 | 52677 |
| long-horizon — disclosed deviation GW | mcp:find_similar | 8 | 98.62 | 97.23 | 96 |
| long-horizon — disclosed deviation GW | mcp:outline | 22 | 172.10 | 87.01 | 14028 |
| long-horizon — disclosed deviation GW | mcp:read_symbol | 24 | 165.74 | 86.45 | 34527 |
| long-horizon — disclosed deviation GW | mcp:repo_map | 9 | 349.66 | 324.13 | 864 |
| long-horizon — disclosed deviation GW | read | 6 | 127.54 | 128.30 | 876 |
| long-horizon — disclosed deviation GW | shell | 208 | 35.63 | 32.97 | 50941 |

## Success guardrails by category

### Navigation

| Category | Shared baseline | Official GW | Disclosed deviation GW |
| --- | --- | --- | --- |
| locate | 208/208 | 208/208 | 208/208 |
| trace | 176/176 | 176/176 | 176/176 |
| fix | 48/48 | 48/48 | 48/48 |
| feature | 48/48 | 48/48 | 48/48 |

### Long-horizon (official column EXPLORATORY)

| Category | Shared baseline | Official GW | Disclosed deviation GW |
| --- | --- | --- | --- |
| feature | 160/160 | 160/160 | 160/160 |

## Adjusted latency rule — not the engineering gate

The stable-v1 confirmatory latency rule separately requires the success guardrail and a strictly positive adjusted97.5% per-suite lower bound (index124). The following is not an overall Phase A declaration. Disclosed deviations cannot substitute for official comparisons, and normalized official LH remains exploratory regardless of interval sign.

| Comparison | Adjusted time-reduction lower bound | Interpretation |
| --- | --- | --- |
| Navigation official compliant | -5.60% | No confirmatory latency win |
| Navigation disclosed deviation | -14.33% | Disclosed deviation, not official confirmation |
| EXPLORATORY official LH | -21.51% | Exploratory only |
| LH disclosed deviation | -21.46% | Disclosed deviation, not official confirmation |

## Root cause — capture harness, not product outline behavior

The failure originates in `bench/capture.mjs` at the frozen source, not the product MCP implementation:

1. Line95 destructures the first user argument into `action`. Lines104–105 parse directory/task and check a missing directory, but do not validate action membership.
2. Lines119–146 load initialized metadata and the begun task. The observed official run11 task was open, and its archived first tool's `action` is literally `outline`. The later valid MCP outline in that same task and the workflow's mistyped-action note corroborate the route; this is not a merely hypothetical warning.
3. Lines174–187 dispatch only read/mcp/shell. A direct outline wrapper action hits `default: throw new Error('Unknown capture action')`. It never enters `case 'mcp'`, so it does not call `mcp(root,args)` or launch the product CLI transport at line82.
4. Lines189–198 catch the error, format `Error: Unknown capture action\n` (exactly30 bytes), then unconditionally append `{action,...}` with the original argv action, byte count and timings. No supported-action validation precedes this append. The frozen `src/bench/schema.ts` permits only mcp/shell/read, and `src/bench/runner.ts:86` rejects the resulting export before grading.

To challenge a product-cause explanation, a separate controlled **baseline** probe invoked the unchanged wrapper with `outline STATE gw-01 ...`. Baseline has no product MCP access. It reproduced the30-byte error and appended `action:"outline"`. This probe is outside all96 captures and all analysis inputs: `/home/ubuntu/bench-diagnosis/v10-wrapper-probe/result.json`. Together with the dispatch source, it demonstrates the defect is reachable without product outline behavior. The historical v10 exact command string/output transcript is unavailable; exact keystrokes are inferred, not independently attested. v9 run6/lh-09 and v10 run11/lh-04 share this malformed-record class, not an established product-tool failure.

### Proposed future pre-registered fix — not implemented

Validate the wrapper verb against `init/list/begin/read/mcp/shell/finish/export` **before task access or timed dispatch**. Reject an unknown verb with nonzero exit status, clear usage and a hint to use `mcp STATE TASK outline JSON`; do not append a schema-invalid tool record. Freeze and preregister the changed collector before new collection. Specify that such pre-dispatch failures are outside captured-tool counts/bytes but remain inside the initialized session envelope when attempted after init. Otherwise comparisons could silently change the action-count estimand.

If future policy instead requires all malformed attempts to count as actions, preregister an explicit failure representation and metrics before collecting (prefer a dedicated typed wrapper-error record in a future schema over pretending it executed shell). A reserved existing shell bucket would need an unmistakable wrapper-error name and explicit disclosure because no shell actually ran. Regression tests for a future change should cover known valid verbs unchanged; unknown/empty/missing-argument invocations; nonzero error status; no corrupted observation; and schema-valid export afterward. No proposed fix was applied retroactively here.

## Historical initial validation and rejected-record evidence

The following records the initial STOP stage, **before the later analysis authorization**. Its statements that analysis had not run describe that stage, not the current completed tables.

## Provenance-check output

```text
PASS 96/96 copies byte-identical to mapped downloaded originals;96 unique labels and URLs match the supplied64 official+32 deviation workflow results.
PASS 96/96 captureRevision=e3bdc7401daf7264b242b32a2d7bc4de09178f69;stable-v1;workspace-ready;correct fixture/suite/arm/run;all1920 fixed task IDs complete and ordered (nav30,LH10).
PASS all session/task/action timings finite,nonnegative,contained and serial;task wallMs=end-start;no baseline MCP/blocked actions.
PASS allocation:16 baseline+16 compliant GW+16 deviation GW per suite;shared baseline not duplicated as independent evidence.
NOTE product=collector pin relies on same-checkout pinned build instructions;exports do not independently attest product binaries. All96 export agent=Devin normal,model=null,node=v24.22.2;actual nav normal/LH fusion settings come from workflow/arms registration,not independent provider metadata.
PASS known-risk v10d-lh-groundwork-13:10 complete tasks;frozen capture schema passes;no invalid action record.
FAIL v10-lh-groundwork-11.json: observations[3].tools[0].action="outline",task lh-04;frozen schema accepts only mcp/shell/read.
Frozen capture schema at e3bdc74:95/96 pass;1 fail (official63/64;deviation32/32;nav48/48;LH47/48).
STOP:no acceptance grading,performance comparisons,per-task/per-tool outcome aggregations or gate verdicts;no normalization,repair,exclusion or replacement.
```

| Suite | Arm | Byte/provenance/completeness | Frozen schema |
| --- | --- | --- | --- |
| nav | Shared baseline | 16/16 | 16/16 |
| nav | Official compliant GW | 16/16 | 16/16 |
| nav | Disclosed deviation GW | 16/16 | 16/16 |
| long-horizon | Shared baseline | 16/16 | 16/16 |
| long-horizon | Official compliant GW | 16/16 | 15/16 |
| long-horizon | Disclosed deviation GW | 16/16 | 16/16 |

### Pin and arm interpretation

The validation checkout is detached exactly at `e3bdc7401daf7264b242b32a2d7bc4de09178f69`; tracked files are unchanged. `v10-validate-schema.mjs` imports that checkout's **unmodified** `src/bench/schema.ts` directly via Node/tsx. The pinned runner uses the same `captureSchema.parse` in `src/bench/runner.ts:86`. Installed zod and tsx versions match the pinned lockfile. This runs schema validation only, not acceptance grading or performance analysis.

Product=collector provenance follows the frozen same-checkout build instructions. No separate product-binary hash, prompt hash, provider/model identity or actual provider mode is recorded in these exports. Every export says agent `Devin normal`, model null, Node v24.22.2, including LH; the prepared workflows/arms note specify normal navigation and fusion LH. Do not treat the default capture label as independently audited mode telemetry.

The official and regenerated-skill deviation arms remain separate as registered in `bench/V10-ARMS-NOTE.md` on `devin/1795348474-v10-phase-a-arms-note`. Each suite has16 shared baseline,16 compliant GW,16 deviation GW sessions. Both comparisons would reuse the same baseline, not duplicate it as independent evidence. The prompt diff and arms note are included in the archive; no product, collector, grader or protocol edit was made.

## Exact blocking record

File: `/home/ubuntu/bench-diagnosis/v10-data/v10-lh-groundwork-11.json`

Task `lh-04`, zero-based observation3/tool0:

```json
{"action":"outline","bytes":30,"startedAt":1795358925716,"endedAt":1795358925717,"durationMs":0.07910900000001675}
```

Frozen schema issue:

```json
[
  {
    "code": "invalid_value",
    "values": [
      "mcp",
      "shell",
      "read"
    ],
    "path": [
      "observations",
      3,
      "tools",
      0,
      "action"
    ],
    "message": "Invalid option: expected one of \"mcp\"|\"shell\"|\"read\""
  }
]
```

The same task next contains a valid `action: "mcp", name: "outline"` record and a valid shell action. Those later actions do not erase the malformed first record.

### What the evidence supports about the failure

The official run11 workflow note says: “All tasks finished in order and passed their smoke checks. One mistyped lh-04 wrapper action was rejected and corrected without accessing the workspace.” The malformed action and following correct MCP call are present in the actual export, so this is not merely a possible code path inferred from a warning.

At the pinned source, `bench/capture.mjs:95` reads the caller's first argument as `action`. For a loaded task, the timed dispatch at lines169–198 switches on that action; `outline` matches no read/mcp/shell branch and hits the default `Unknown capture action` error at line187. The catch formats the error, appends a newline and still pushes the original caller-supplied action string to the observation. `Error: Unknown capture action\n` is exactly30 UTF-8 bytes, matching the archived record. The rejected action, its output length, subsequent correct call and workflow note are consistent with invoking outline as the wrapper action instead of through mcp. Original command/output text and outer agent transcript are not archived, so the exact keystrokes and literal output are source-based reconstruction, not independently observed transcript evidence.

This is the same schema-failure class as v9's malformed outline action, but a different capture/task. Nothing was adapted for analysis.

## Specifically flagged deviation run13

`v10d-lh-groundwork-13.json` **passes the complete frozen capture schema**. Its10 tasks and all task/action timestamps are complete and ordered. In `lh-04` the archived tools are a valid `mcp` named `outline` and a valid shell action; there is no out-of-enum action anywhere in this capture.

Its workflow note reports: “One malformed wrapper invocation after beginning lh-04 printed usage and exited without accessing the workspace; the task then continued through the specified wrappers.” That is not the invalid record found in official run11. The pinned wrapper has a pre-dispatch usage guard at `bench/capture.mjs:105`, before action instrumentation, consistent with an invocation leaving no action record. The exact command and which argument check caused its usage exit are not independently recoverable from this export. A schema pass is not a claim that the reported uncaptured invocation never occurred or incurred no outer-session cost.


## Relaunch disclosure:18 never-started attempts,17 distinct units

Per `/home/ubuntu/bench-rerun/STATE.md`,18 never-started session attempts were terminated and relaunched fresh; they collected no data. There are17 distinct planned labels because official nav baseline10 required a second termination/relaunch. Only the final finished attachment for each planned label is present in the supplied map. The intermediate running totals in STATE.md lag its expanded label list; the expanded list reconciles to18 attempts across17 labels. This is the collection owner's lifecycle account, not independently recovered launch telemetry.

1. `v10d-nav-groundwork-1`
2. `v10d-nav-groundwork-2`
3. `v10d-lh-groundwork-1`
4. `v10-nav-groundwork-1`
5. `v10-nav-groundwork-2`
6. `v10-lh-baseline-2`
7. `v10-lh-groundwork-2`
8. `v10-lh-baseline-4`
9. `v10-nav-groundwork-6`
10. `v10-nav-baseline-7`
11. `v10-nav-baseline-8`
12. `v10-nav-groundwork-7`
13. `v10-lh-groundwork-7`
14. `v10d-nav-groundwork-6`
15. `v10d-nav-groundwork-10`
16. `v10-nav-baseline-10`
17. `v10-nav-groundwork-9`
18. `v10-nav-baseline-10` — second never-started attempt for this unit.

No capture was discarded based on measured outcomes. Relaunches do not fix the schema rejection in official LH11.


## Artifacts and checks

- Updated report: `/home/ubuntu/bench-diagnosis/v10-results.md`.
- Unchanged96-raw-capture archive: `/home/ubuntu/bench-diagnosis/v10-captures.tgz`, SHA-256 `903a4fb3bb1587c8b0ebde1bcbec136686db9ad359784e34198523d2a265a352`. The archive preserves the initial validation-stage evidence; later grade/analysis outputs are separate below.
- Frozen outputs: `v10-data/grader-output/{official-nav,deviation-nav,EXPLORATORY-official-lh,deviation-lh}/`; each contains report JSON/Markdown and evidence JSON.
- Independent bootstrap snapshots/per-tool statistics: `v10-data/analysis/analysis.json`; session metrics: `v10-data/session-metrics.csv`; detailed per-tool report: `/home/ubuntu/bench-diagnosis/v10-per-tool.md`.
- Analysis-only copies: `v10-data/analysis-inputs/`. Only EXPLORATORY-official-lh contains the one explicitly annotated action mapping. Raw files at the data directory root remain unchanged.
- Reproduction: frozen build then `node /home/ubuntu/bench-diagnosis/v10-grade.mjs` (refuses to overwrite existing grade outputs), then `python3 /home/ubuntu/bench-diagnosis/v10-analyze.py`. No product/grader/schema/harness/protocol source edits.

```text
PASS official-nav: pinned stable-v1 grader; B 480/480; GW 480/480; analysis-only mappings=0
PASS deviation-nav: pinned stable-v1 grader; B 480/480; GW 480/480; analysis-only mappings=0
PASS EXPLORATORY-official-lh: pinned stable-v1 grader; B 160/160; GW 160/160; analysis-only mappings=1
PASS deviation-lh: pinned stable-v1 grader; B 160/160; GW 160/160; analysis-only mappings=0
PASS independently reproduced all12 pinned primary mean/reduction intervals and all4 action bootstrap contrasts.
PASS all96 raw captures still byte-identical to original hashes and mapped downloaded originals.
PASS per-tool totals reconcile with per-session calls,bytes and durations;LH per-task counts reconcile with session action totals.
```

Build completed exit0. Acceptance grading uses the frozen suite verifiers, not agent-reported smoke-test claims. No source commit or push.
<!-- v10-analysis-source:end -->

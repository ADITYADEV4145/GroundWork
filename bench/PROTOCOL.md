# Stable protocol v1 (v7), pre-registration

Committed before v7 collection. Product is main at e0cad99; only benchmark
instrumentation/analysis changes are permitted. No experimental graph cache,
callee_depth or relay bundle. Identical collection and acceptance rules in both
arms. Existing suite graders/fixtures are unchanged. Experimental read paths stay off.

## Collection

Exactly 16 complete sessions per arm per suite (64 sessions), runs 1–16.
Each session is an independent agent context; no shared answers across arms.
Retain fixed manifest order and LH context/dependencies. No optional stopping,
exclusions, replacement of unfavorable results or pooling with older versions.
Export honest partial captures on blockers; incomplete collection invalidates a
confirmatory comparison and is reported, not silently dropped or replaced.

Set GW_BENCH_PROTOCOL=stable-v1. `init STATE ARM RUN` prepares the first task
workspace, then records sessionStartedAt before `list STATE` reveals tasks.
`begin` reuses that prepared workspace. Subsequent setup, gaps, agent/tool waits
and retries are inside the session envelope. Last manifest task's finish records
sessionEndedAt. This harness owns the timestamps, not the outer model dispatch:
provisioning, install/build, pre-init instructions and final export are excluded.
Do not call state-free list or inspect prompts/source before init/list STATE.
These are session-envelope measurements, not provider reasoning time.

Every read/mcp/shell action, including errors and empty responses, records epoch
startedAt/endedAt and monotonic durationMs around dispatch, hooks, transport and
response construction. It excludes CLI startup before dispatch and delivery
after dispatch; total tool-side time is the sum of these serial action durations.
Legacy task startedAt/wallMs remain unchanged; endedAt is added at finish.
Clock reversals/malformed timing are rejected, never repaired silently.

## Frozen analysis

Per suite, primary estimands are ratios of arm arithmetic means:
1. session elapsed / fixed task count;
2. aggregate emitted UTF-8 tool bytes per session;
3. total tool-side milliseconds per session (dispatch definition above).

Report both arm means and reduction = 100*(1-mean(GW)/mean(baseline)).
Zero baseline means yield unavailable reductions, not artificial savings.
Use 10,000 independent whole-session bootstrap draws per arm, xorshift32 seed
0x51ab17ed reset per metric, nearest-rank percentiles: sorted indices 249/9749.
No arbitrary run-label pairing; preserve all tasks within each resampled session.
Require all 16 sessions in each arm for stable-v1. Missing instrumentation is an
error, not zero tool time. Success is a guardrail: no category may have fewer GW
successes; report counts/failures alongside performance, with no correctness-win
claim from equal scores. Never drop a failed task's costs.

Latency (1) is the confirmatory primary per suite; bytes/tool time are secondary
primary cost estimands, not alternative ways to declare an agent-latency win.
Show nominal 95% intervals for all three. For a confirmatory latency win require
the success guardrail and a positive lower bound at 97.5% per-suite confidence
(Bonferroni across two suites); additionally show that adjusted bound. No overall
win selected after inspecting six intervals. Publish inconclusive/negative results.
Old median paired-task reductions and task-bootstrap intervals are secondary only.
Bytes/4 are estimated tool output, not provider-billed tokens or dollar savings.

## Historical sensitivity

Reanalyze raw archives only into an external report. Approximate elapsed as first
task begin to last finish; label historical-envelope-proxy, not stable-v1.
Old files have no tool-side durations: report unavailable. Do not modify archives,
published rows, or infer provider/VM time from residuals. Six changed rounds are
not independent replications of one treatment. New-session bootstrap precision
does not measure unobserved provider-wave or new-project variance.

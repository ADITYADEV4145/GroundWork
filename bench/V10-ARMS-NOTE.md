# v10 Phase A gate: arm definitions

Recorded 2026-11-22, before any v10 collection. Preparation only: no workflow
registration or agent launch. This note does not amend `PROTOCOL.md`.

Product and stable-v1 collector/grader source for every arm: PR #48, commit
`e3bdc7401daf7264b242b32a2d7bc4de09178f69`, branch
`devin/1795347287-tool-side-time` (stacked on PR #41). This measures that pinned
product; it does not say that PR #48 or PR #41 is shipped on main.

## Arms frozen before collection

| Arm and labels (N = 1–16) | Suites | Prompt guidance | Role |
|---|---|---|---|
| Baseline (`v10-nav-baseline-N`, `v10-lh-baseline-N`) | nav, LH | v9 baseline text; only revision/fetch pin and run labels change | Shared baseline for that suite's two comparisons |
| GroundWork compliant (`v10-nav-groundwork-N`) | nav | Frozen v8-compliant navigation text, as in v9c | **Official navigation engineering gate** |
| GroundWork compliant (`v10-lh-groundwork-N`) | LH | Frozen v8-compliant LH text, as in v9 | **Official LH engineering gate** |
| GroundWork regenerated (`v10d-nav-groundwork-N`) | nav | Navigation steps 1 and 2 replaced verbatim by the corresponding `SKILL.md` steps at the product pin | **Disclosed deviation**, next to compliant results, never in their place |
| GroundWork regenerated (`v10d-lh-groundwork-N`) | LH | Verbatim single-file `outline` example from `references/navigation.md` at the product pin inserted after the existing continuing-work orientation line | **Disclosed deviation**, next to compliant results, never in their place |

Both suites get deviation arms. Regeneration is limited to the corresponding
navigation guidance, not wholesale replacement of the task or reuse/verification
instructions. The nav deviation restores the current skill's default-body/batched
`find_code` step (already changed in v9's deviation) and its known-helper/outline
step, including the new instruction that a single small file comes back whole.
The LH deviation adds the reference's exact single-file outline example: a file
that fits the 400-token budget comes back whole; answer without a follow-up read,
or request `include_body:false` for only the list. The frozen compliant LH prompt
has orientation/batched-outline guidance but not this new single-file instruction.
All other skill and task instructions remain unchanged. These are explicit
prompt deviations under the unchanged stable-v1 protocol, not replacements for
the official compliant arms.

## Collection allocation and controls

- Official workflow: `workflow_v10_throttled.py`, semaphore 8, nav/LH ×
  baseline/GroundWork × runs 1–16 = **64 independent sessions**.
- Deviation workflow: `workflow_v10d_throttled.py`, semaphore 4, nav/LH ×
  regenerated GroundWork × runs 1–16 = **32 independent sessions**.
- Total planned allocation: **96 sessions**; 16 per arm per suite. Each suite
  has 16 baseline, 16 compliant GroundWork and 16 regenerated GroundWork sessions.
  Reuse the same baseline in its two contrasts; do not duplicate it as independent
  evidence, pool GroundWork arms, replace runs or pool rounds.
- Preserve v9's suite modes: nav `normal`, LH `fusion`, identically across the
  arms within each suite. Preserve the 40-minute soft limit and wrapper access
  rules. Both workflows reject a template lacking the frozen commit pin.
- Baseline has captured shell/read access; GroundWork additionally has captured
  MCP and the existing Read hook. No new hooks, wrappers or product settings are
  introduced by this preparation. Experimental read paths remain off.
- Use stable-v1; initialize before stateful task disclosure; preserve all 30 nav
  tasks and all 10 sequential LH steps. Tasks, graders, capture code, protocol,
  bootstrap and success rules are unchanged. The product pin has no changes to
  `bench/PROTOCOL.md`, `bench/capture.mjs` or `src/bench` relative to v9's pin.
- Record launch/collection order when collection is actually authorized. This
  preparation does not authorize or register either workflow. Retain all costs,
  errors and honest partial exports; incomplete/invalid collection blocks a
  confirmatory comparison under `PROTOCOL.md`.

## Gates and reporting, separately for each suite

The **official** comparison is baseline versus compliant GroundWork. Report the
regenerated-skill comparison beside it as a **disclosed deviation**, never instead
of it. For each comparison, the Phase A engineering gate requires:

1. Mean GroundWork captured actions/session ≤ baseline mean.
2. The nominal 95% whole-session-bootstrap session-time reduction interval
   includes zero or is wholly favorable (its upper endpoint is ≥ 0).
3. The success guardrail is met: no category has fewer GroundWork successes.

An action is one captured wrapper tool call, summing `observation.tools.length`,
including errors/empty responses; it is not an LLM conversation turn. Session
time/task uses the recorded workspace-ready init-to-last-finish envelope divided
by the suite's fixed task count. Report both arm means, action difference with CI,
session time/task, emitted bytes/session, tool-side ms/session and success counts.
Use unchanged stable-v1 whole-session resampling (10,000 independent draws/arm,
xorshift32 seed `0x51ab17ed` reset per metric, indices 249/9749). Run numbers are
not pairs; positive reduction `100*(1-GW/baseline)` favors GroundWork.

Engineering-gate passage is not a confirmatory speed win, equivalence proof or
overall Phase A pass. Any confirmatory latency claim must separately satisfy
`PROTOCOL.md`, including its adjusted 97.5% per-suite lower bound and success
guardrail. Publish inconclusive and unfavorable outcomes. Bytes are emitted tool
output, not billed tokens or dollar savings.

## Prepared prompt artifacts

External preparation directory: `/home/ubuntu/bench-rerun`.
Compliant templates: `prompts/{nav,lh}-{baseline,groundwork}.v10.tmpl.txt`.
Deviation templates: `prompts/{nav,lh}-groundwork.v10d.tmpl.txt`.
The complete per-suite compliant/deviation unified diff, including state/export
labels, is `v10-prompt-diff.diff`. The source lines above are copied verbatim,
not paraphrased. No v9/v9c workflow or prompt file is overwritten.

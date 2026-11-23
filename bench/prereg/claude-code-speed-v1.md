# Preregistration: Claude Code speed and cost rerun (`claude-code-speed-v1`)

Status: registered, **not run**. No session under this protocol has been started, and this file makes no claim.

This protocol reruns the navigation suite (`bench/nav`, 30 tasks) and the long-horizon suite (`bench/long-horizon`, 10 steps) with Claude Code as the agent, with and without GroundWork. `bench/PROTOCOL.md` (stable-v1) measures emitted tool-output bytes from a scripted collector. This protocol instead measures what the provider bills for a real agent. Its results are never pooled with stable-v1, with earlier rounds, or with the exploratory Devin pilots.

## Arms

- `baseline`: Claude Code in the pinned task workspace, no GroundWork files, an empty MCP configuration.
- `groundwork`: the same, after `gw init` and `gw setup --agent claude --profile standard` from the checkout under test, with the GroundWork MCP server as the only MCP server.

Both arms use the same Claude Code version, model, `--max-turns 40`, a 15-minute limit per task, the unchanged task prompt, and `--strict-mcp-config`. Navigation prompts get one fixed added sentence asking for the answer as a JSON array on the last line; it is identical in both arms.

## Sessions

- Exactly 16 sessions per arm per suite, runs 1 to 16, 64 sessions in total. A session is every task of the suite in manifest order, each task in a fresh conversation and a fresh workspace at the suite's pinned revision. A long-horizon step starts from the patches of that session's earlier steps.
- Order: for run 1 to 16, `baseline` then `groundwork` on odd runs and the reverse on even runs, navigation before long-horizon.
- The model, Claude Code version and GroundWork commit are fixed before run 1 and written here by a commit made before run 1. All sessions use one GroundWork commit.
- No optional stopping, exclusions, replacement sessions or reruns. An interrupted session resumes at its first unfinished task, after the operator removes its `session.lock`; finished task records are never overwritten.

## What is recorded

Per task: the provider-reported usage from Claude Code's JSON result (input, output, cache-read and cache-write tokens, and cost in USD when reported), wall time of the Claude Code process, exit status, the patch or answer, and the full JSON result. Usage is never estimated: a task with no provider usage is recorded as invalid.

## Estimands

Primary, per suite: percent reduction in mean billed tokens per session, `100 * (1 - groundwork / baseline)`, where billed tokens are input + output + cache-read + cache-write summed over the session's tasks.

Secondary, descriptive only: the same reduction for wall time and for reported cost; success counts by task category; long-horizon duplicate and invented-call metrics.

Intervals come from 10,000 whole-session bootstrap draws, sessions resampled independently within each arm, xorshift32 seeded `0x51ab17ed`. The primary interval is two-sided 98.75% (the 0.625th and 99.375th percentiles; Bonferroni over 2 suites and 2 directions of interest); 95% intervals are reported alongside.

## Decision rule, per suite

1. If any of the 32 sessions is missing, or any task record is missing or invalid, the suite is reported as exploratory with no verdict, and the records are still published.
2. Success guardrail: GroundWork's success count must be at least baseline's in every task category. If not, the verdict is "fail", whatever the token result.
3. With the guardrail met: a 98.75% interval entirely above zero supports a billed-token reduction; entirely below zero is reported as a billed-token increase; otherwise inconclusive.

Equal success counts are not a correctness win. No speed or cost claim is made from wall time or reported cost alone.

## Publication

Every session directory is published as recorded, including failed, invalid, timed-out and negative results, with the `report` output. A cost estimate and the session count go to the maintainer before the first billed session.

## Known limits

- Wall time includes provider latency and is not controlled for load.
- The fixtures and GroundWork's own source are public; the model may have seen them.
- One agent and one model: the result does not generalise to other agents.
- GroundWork's setup time (`gw init`, `gw setup`) is outside the measured Claude Code process and is not counted.

## Commands

```
npm run build
node bench/claude-code/driver.mjs run --suite nav --arm baseline --run 1 --model <model> --out <dir outside the checkout>
node bench/claude-code/driver.mjs report --out <dir>
```

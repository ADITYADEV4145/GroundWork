# Multi-turn reuse v1 — pre-registration

Pre-collection amendment: PR #44 corrects nested-token double counting, conditional-function clone coverage, rebound local-import resolution and package-initializer relative imports; no agent data exists and thresholds, estimands and decision rules are unchanged.

Freeze this document and the task/hidden manifests, acceptance tests, clone detector,
grader, collector and product pin before collection. Inspired by RepoReuse [1]
(arXiv:2609.35357) and SlopCodeBench [3] (arXiv:2603.24755); not a reproduction
of either paper. Existing suites and PROTOCOL.md are unchanged.

## Design and collection

Two real repositories, pinned independently of the collector: Click (BSD-3-Clause),
528fd7a798abe0077060c5720e13791a34167f66; pytest (MIT),
1b1375ff57b8c2f1d666306fee1fa81747156218. Full source snapshots come from verified
git archives in an external cache. No synthetic replacement repositories.
Two five-turn chains per repository. All five turns are required. Each independent
agent context receives exactly one chain, one requirement at a time. Requirements
are disclosed by stateful list after init and successive finishes, not as a batch.
One persistent workspace per chain, including GroundWork state, survives all turns.
Finish exports incremental patches; hidden grading replays all five patches in order.
No hidden files or solutions are copied into the agent workspace.

Run 16 independent chain-sessions per arm **for every agent**, balanced four per chain.
Agents are Devin normal and Devin fusion (distinct modes, not independent providers).
Two modes × two arms × 16 = 64 sessions, 320 turns. Run r is assigned to
chain (r−1) modulo 4 in repos.json order: four independent sessions per chain/arm/mode.
No cross-context answers, no pooled normal/fusion analysis. Product/collector pins
must be identical in both arms. Baseline has shell/Read; GroundWork additionally
has the existing MCP tools and hooks. Requirements, acceptance, timing, output
limits and setup apply identically; experimental read paths remain off.

Use capture.mjs with GW_BENCH_SUITE=multiturn-reuse, GW_BENCH_CHAIN set to the
assigned chain, GW_BENCH_PROTOCOL=stable-v1, and GW_BENCH_AGENT set to the actual
mode label. Init prepares the first workspace then records sessionStartedAt before
stateful list. sessionEndedAt is recorded after turn 5 finish, including patch
capture. Install/setup, pre-init instructions and export are excluded. Keep task
begin→finish fields and instrumented serial read/mcp/shell action spans exactly
as stable-v1. Clock reversals/missing instrumentation invalidate collection.

## Frozen metrics

Hidden opportunities specify canonical file+symbol and, from turn 2 onward,
the exact earlier requirement that creates each agent capability. Reuse is judged
from Python AST bindings and an interprocedural call graph rooted in the required
turn entry point: imports/aliases must resolve to the canonical file+definition,
or a definition present at its prescribed earlier turn. Names alone, shadowed
imports, unreachable literal-false calls and same-name reimplementations do not
count. Dynamic/reflection calls and unsupported bindings are unresolved, not
automatic reuse. Report resolution limitations, not inferred intent. Current-turn
and final-turn opportunity rates are both reported; preserving unused helpers is
not reuse. Acceptance is independent of this static metric.

Primary: **cumulative duplicated-logic token rate at turn 5**, per chain-session.
Python tokenize + AST remove comments/docstrings/formatting; non-keyword names
become ID, string/number literals become STR/NUM, keywords/operators remain.
Winnowing uses k=25 tokens, window=4, deterministic SHA-256 fingerprints with
rightmost-minimum selection. Verify/extend candidate matches against token arrays;
count only contiguous matches of at least **50 normalized tokens**. No fuzzy
similarity threshold. Near-miss renames match, changed control flow need not.
Compare newly introduced logic with (a) all pinned pre-existing Python function
bodies and (b) bodies introduced in previous turns. Same definition's own earlier
version is excluded from (b), so extending a helper is not inherently cloning it.
Each introduced token counts once in the union even if both sources match.
For edited definitions SequenceMatcher identifies inserted/replaced normalized
tokens; deletions do not add exposure. Cumulative numerator and denominator sum
token introductions through the current turn; deleting a copy later does not erase
earlier introduced redundancy. Zero added tokens => rate zero plus an explicit
empty-growth flag; acceptance guardrail prevents empty solutions winning.

Secondary: AST-resolved planted-opportunity reuse rate, net added nonblank Python
LOC per turn and cumulative growth, repo-vs-earlier clone coverage, and all per-turn
curves. Per-turn hidden acceptance tests include earlier contracts and mutation,
empty and invalid inputs. Failure costs remain included. This measures reuse of
planted capabilities, not every possible repository abstraction or semantic clone.
Acceptance tests cannot establish arbitrary equivalence or security.

## Frozen analysis and gate

Pre-agent-data clarification: the requested 16 sessions per arm per agent are
balanced across the four chains, not multiplied by the number of chains. Synthetic
calibration is not agent collection. For each mode, compute arithmetic mean chain-session rate within each chain and
then the equally weighted four-chain mean. Primary contrast is baseline minus
GroundWork rate in percentage points (positive favors GroundWork). Avoid dividing
by zero baseline duplicate rates. Report both means and 95% CIs using 10,000
independent whole-chain-session resamples within each chain/arm, xorshift32 seed
0x51ab17ed reset per metric; nearest-rank sorted indices249/9749. No run-label
pairing, task/token bootstrap or selecting the best chain. Secondary reuse/growth
contrasts and per-turn curves use the same unit and fixed stratification.

Guardrail: GroundWork success count must not be below baseline for **any chain
or turn within either mode**. Gate requires success guardrails and a strictly
positive primary lower CI bound **on both modes**. This conjunction is the
pre-registered two-agent gate; neither mode alone establishes a win. Publish all
chains, modes, outcomes and intervals, including failures/inconclusive results.
Equal success is not a correctness win. Timing/bytes are cost descriptions, not
primary endpoints or billed-token/dollar measurements.

## Exclusions and deviations

No optional stopping, outcome-dependent drops, replacements, trimming, repair of
timing or reuse of earlier experiments. Require every planned run, exactly five
complete ordered turns, verified pins and actual mode metadata. An incomplete,
wrong-pin, missing-timing or wrong-mode export invalidates that mode's confirmatory
analysis; retain/report partial exports separately rather than silently excluding.
Malformed source or acceptance timeout is a failed turn with costs retained;
missing grader dependencies, corrupt snapshots or analysis exceptions are errors,
not zero duplication. No minimum duration exclusion.

Report tool failures/retries, setup/env repairs, uncaptured reads or writes,
pre-disclosure planning/source inspection, viewing hidden tests/manifests,
turn skipping/batching, out-of-workspace scripts, altered existing repository files,
missing reuse checks and any mode/pin/default-off deviation. Hidden-test inspection
or sharing answers invalidates the affected planned mode comparison; preserve the
records and explain rather than substituting a favorable replacement. Baseline
treatment use is invalid, not a scored baseline success. Identical infrastructure
failure rules apply to both arms. Scripted dry runs validate instrumentation and
metric separation only; they are labelled synthetic and are not agent data.

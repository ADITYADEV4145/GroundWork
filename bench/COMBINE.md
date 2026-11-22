# Combining paired runs

## Round 5 (v6)

Round 5 pins both arms to `2183b1ba50fb8669d43a318c883f3a9ac0c8ecb4`.
The sessions still export `nav3-*` / `lh3-*` filenames; select v6 explicitly:

```sh
node scripts/bench-combine-v2.mjs --experiment v6 \
  --nav-captures /path/to/v6-nav-exports \
  --lh-captures /path/to/v6-lh-exports \
  --build /path/to/built-2183b1b-checkout
```

V6 writes only `bench/{nav,long-horizon}/v6/{observations,results}` evidence,
archiving unchanged export bytes as `nav6-*` / `lh6-*`. All earlier evidence
and published rows are preserved. The sixth row per suite stays Pending until
both fresh eight-run suite reports are present; experiments are not pooled.
Synthetic orchestration tests are not benchmark results.

Round 5 adds versioned graph-cache clones into root-local indexes with freshness
checks, budgeted resolved definitions via `read_symbol` `callee_depth`, a thin
relay bootstrap, and trace/stop-at-location guidance. The Read hook pair and
find_code post-hook remain; experimental read paths remain default-off behind
`navigation.experimentalReadPaths`. The v6 navigation guidance adds the trace
affordance and stop-at-location rule; LH guidance is unchanged apart from the
revision setup. Baselines were freshly collected at 2183b1b. Cross-round changes
do not isolate implementation effects from prompts or baseline variation.

V6 workflow session notes: navigation baseline-3 ran one rg directly outside the capture wrapper. Navigation GroundWork-1 reported an early non-wrapper shell failure and a gw-01 finish retry. Several sessions chained begin/finish/tool calls sequentially and used external wrapper scripts for cwd/environment or shell-function persistence; LH GroundWork-3 retried early cwd/unset-variable failures. Navigation GroundWork-2 reused paths learned in earlier tasks, and several GroundWork runs seeded fitToBudget or formatZodError from preloaded AGENTS.md while confirming answers with current-task tools. Navigation GroundWork-7/8 used captured shell cat instead of the read wrapper. Extra maps, depth-2 orientation and repeated confirmation after resolved locations were also noted. Navigation GroundWork-5 captured an invalid read_symbols call. Several LH GroundWork runs used outline plus read_symbol (sometimes also repo_map) rather than one orientation step; GroundWork-8 repeated the unchanged normalizeEmail body. LH GroundWork-1/2/4/5 introduced or extracted shared sorting helpers without similarity checks. Explicit verify_calls was skipped with reported prior confirmation of cross-file targets, consistent with the guidance when that evidence was unchanged. Edits included corrections and ad-hoc shell-wrapper smoke checks, some were untested, and Python cache cleanup was noted. These are recorded executions, not perfectly uniform protocol adherence. Work outside wrappers or task timers is unmeasured; shell writes still do not dispatch edit or Stop hooks.

## Round 4 (v5)

Round 4 pins both arms to `6f242a68c4e2461a4156089f1195d60affcbbc59`.
The sessions still export `nav3-*` / `lh3-*` filenames; select v5 explicitly:

```sh
node scripts/bench-combine-v2.mjs --experiment v5 \\
  --nav-captures /path/to/v5-nav-exports \\
  --lh-captures /path/to/v5-lh-exports \\
  --build /path/to/built-6f242a6-checkout
```

V5 writes only `bench/{nav,long-horizon}/v5/{observations,results}` evidence,
archiving unchanged export bytes as `nav5-*` / `lh5-*`. Original/v2/v3/v4 evidence
and the published Round 3 results are preserved. The fifth row per suite stays
Pending until both fresh eight-run suite reports are present; experiments are
not pooled. Synthetic orchestration tests are not benchmark results.

Round 4 includes batched outline, a shared daemon with root-local state and
trimmed orientation/search/verification guidance. The round-3 read paths
(large-Read compaction and explore-first guidance) are now default-off behind
`navigation.experimentalReadPaths`. The v5 GroundWork prompts run defaults;
explore remains available, and batched read_symbol, include_body, hook forwarding
and carried evidence remain on. Baselines are freshly collected at 6f242a6;
protocol and implementation effects cannot be separated by cross-round comparisons.

V5 workflow session notes: navigation baseline-1 submitted a finish and the next begin in the same turn with a three-second delay, so strict sequencing is not guaranteed. Several cwd/environment/shell/quoting failures were retried, some before capture. Navigation GroundWork-3/4/8 reported invalid read_symbols calls; GroundWork-1/4/5/6 used captured shell cat, and some edits used shell sed/git diff instead of read wrappers. Several searches used fitToBudget from the preloaded AGENTS.md. GroundWork-3 staged edit scripts in ~/edits using earlier-task definitions, then re-read targets in the edit tasks; GroundWork-7 used repo_map depth 2. LH baseline-3/4/6/8 staged scratch checks in /tmp, and baseline-7 was executed by a same-VM subagent. Several LH GroundWork runs used repo_map plus outline plus batched read_symbol rather than a single orientation step; GroundWork-7 repeated two unchanged helper lookups. GroundWork-1 called find_similar after writing the helper; GroundWork-4 skipped it for a new shared helper, while other runs skipped searches for requested exports or extensions. Several runs skipped explicit verify_calls because cross-file targets were already confirmed by unchanged read_symbol evidence. Quick checks and Python __pycache__ cleanup were also noted. These are recorded executions, not perfectly uniform protocol adherence. Work outside wrappers or task timers is unmeasured; shell writes still do not dispatch edit or Stop hooks.

## Round 3 (v4)

Round 3 pins both arms to `ff578514d78397faffd2ac1836fb3cbd03e62ee1`.
The sessions still export `nav3-*` / `lh3-*` filenames; select v4 explicitly:

```sh
node scripts/bench-combine-v2.mjs --experiment v4 \
  --nav-captures /path/to/v4-nav-exports \
  --lh-captures /path/to/v4-lh-exports \
  --build /path/to/built-ff57851-checkout
```

V4 writes only `bench/{nav,long-horizon}/v4/{observations,results}` evidence,
archiving unchanged export bytes as `nav4-*` / `lh4-*`. Original/v2/v3 evidence
is preserved. Tables and charts show four experiments per suite, without pooling.
GroundWork prompts mirror explore-first traces, opt-in bodies, batched symbol
reads, and carried unchanged evidence; LH uses batched verification instead of
verification-only rereads. Baselines were re-collected at ff57851. These protocol
and implementation changes cannot be separated by cross-round comparisons.

V4 workflow session notes: several GroundWork outline calls failed on path/files arguments instead of file, with corrected retries; early cwd/environment setup failures were also retried, sometimes before reaching capture. Navigation baseline-4 and GroundWork-8 used shell cat instead of the read wrapper; GroundWork-1/6 used shell sed for source ranges. These reads still went through the shell wrapper. Several navigation GroundWork runs seeded names from AGENTS.md or earlier tasks, then checked them with current-task tools. Some runs used local wrapper helpers, sequentially chained calls, or scripts staged outside the workspace; LH GroundWork-2 also wrote an unused /tmp/t4.mjs. Navigation GroundWork-1 used repo_map depth 2, and LH GroundWork-3 repeated an unchanged helper lookup. LH GroundWork-5 skipped similarity checks for compositions of confirmed helpers; LH GroundWork-4 skipped explicit verification after read_symbol confirmation. These are recorded executions, not perfectly uniform protocol adherence. Work outside wrappers or task timers is unmeasured; shell writes still do not dispatch edit or Stop hooks.

## Post-fix experiments (v2 and v3)

The same entrypoint supports `--experiment v2` (the default, round 1 at
`e605fe9559cae088a2060a4ed53a27c32daa4df9`) and `--experiment v3` (round 2 at
`abafcba361f358b61e54fc906977209e494cf07a`). No grading semantics change.
For the incoming `nav3-*` / `lh3-*` exports, use a built checkout at abafcba:

```sh
node scripts/bench-combine-v2.mjs --experiment v3 \
  --nav-captures /path/to/nav3-captures \
  --lh-captures /path/to/lh3-captures \
  --build /path/to/built-abafcba-checkout
```

V3 writes only `bench/{nav,long-horizon}/v3/{observations,results}` evidence;
raw archives are named `nav3-{arm}-{run}.json` and `lh3-{arm}-{run}.json`.
Original and v2 evidence are preserved. Comparison tables/charts have three
rows per suite: original, round 1, round 2. Each new experiment stays Pending
until both suite reports are present; a partial pair is an error. Round 2's
GroundWork arm prompts mirrored the new SKILL.md guidance (rg for trivial
lookups, exact-first find_code, actionable-only find_similar, verify only for
unconfirmed cross-file calls); baselines were re-collected at abafcba.

### Replaying round 1

The fresh paired experiment pins both arms and suites to collector/tool revision
`e605fe9559cae088a2060a4ed53a27c32daa4df9`. Its GroundWork LH arm uses revised
guidance with fewer required calls: this is a protocol change, not just an
implementation comparison. Baselines were re-collected at the new commit.

Keep these exports separate from the published pre-fix captures. Once all 32
exports arrive, use a built checkout at **exactly** that revision:

```sh
node scripts/bench-combine-v2.mjs \
  --nav-captures /path/to/new-nav-exports \
  --lh-captures /path/to/new-lh-exports \
  --build /path/to/built-e605fe9-checkout
node --test scripts/bench-*.test.mjs
```

The current PR checkout/build can serve as `--build` while its HEAD is e605fe9;
after committing preparation changes, retain a separate detached worktree/build
at e605fe9. Historical compatibility builds are **not** used for v2 grading.
The command requires runs 1–8 for both arms, checks revision/agent/model/Node,
and uses the unchanged suite graders. Higher runs are ignored; missing and
duplicate selected runs or differing archived exports are rejected.

It writes only `bench/{nav,long-horizon}/v2/{observations,results}` for evidence,
then regenerates new `before-after-{output,wall,success}.svg` charts and marked
README/site comparison sections. Existing published evidence, charts (including
copied-code and grounding results), and prose outside those sections are preserved.
Both suites must grade successfully before either suite is archived. Identical
archive replays are allowed; differing bytes cannot replace existing captures.

To regenerate just the comparison from saved reports:
`node scripts/bench-comparison.mjs`. With neither report for a new experiment present, its
rows/charts say Pending. One missing report or inconsistent statistics/revisions
is an error, never silently presented as a completed comparison. Synthetic test
fixtures must stay outside the repository; do not publish old data as new results.

## Published pre-fix experiment

Navigation and long-horizon `results/combined.evidence.json` files feed the charts.
`results/combined.json` and `results/combined.md` retain the complete latest
combined grader output; existing active evidence, dated historical reports and
initial navigation evidence are not replaced. Run counts and chart sample sizes
are read from the combined evidence. The historical pinned graders do not emit
the newer long-horizon evaluator fingerprint; combined reports retain their
actual output rather than attaching a fingerprint for a different evaluator.

Collect every task in a fresh session for each arm/run, using Node v24.22.2,
agent `Devin normal`, model `null`, and these exact collector checkouts:

- Navigation: `e0c5f6bbc7a49f9399abf4227ef7253958d03a97`
- Long-horizon: `fa8657cbb6bc73dfb9a8011b891f55b6af499eda`

Build each checkout before use. Only grade trusted capture exports: graders
apply patches and execute local assertions, not a sandbox. Each capture directory
must contain exactly both arms for runs 1 through N, with no smoke exports.

```sh
node scripts/bench-combine.mjs --runs 8 \
  --nav-captures /home/ubuntu/bench-combined/nav-captures \
  --lh-captures /home/ubuntu/bench-combined/lh-captures \
  --nav-build /home/ubuntu/bench-compat-exact-nav \
  --lh-build /home/ubuntu/bench-compat-lh
```

The default run count is 8. Use `--runs 3` to replay the original captures.
Both graders must succeed before any combined repository evidence is replaced. The script
archives raw exports in each suite's `observations/`, writes combined evidence and
combined reports, and regenerates both copies of all charts. Review results and
update README/website prose before publishing; old prose must not be assumed true
for new data. This command neither commits nor deploys.

Wall-time bars show arithmetic means, while the separate whiskers show the median
of paired-task percentage reductions with the grader's seeded 95% task-bootstrap
interval. These are different estimands: do not interpret the whiskers as confidence
intervals around the mean bars. Repeats are summed within task; tasks, not sessions,
are resampled (2,000 draws, seed `0x963b41d7`). Positive means faster; negative means
slower. Shared sequential context and between-session/model variation are not
accounted for by these intervals.

Protocol deviations were noted per session: some sessions wrote files via the
shell wrapper rather than the read wrapper, and one long-horizon agent's first
`find_similar` call failed validation. Captures describe those executions, not a
perfectly uniform protocol; work outside wrappers or task timers is unmeasured.

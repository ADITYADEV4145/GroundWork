import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { project, repositories } from './real-repos.js';
import type { CheckFinding, CheckLocation } from '../src/reuse/check.js';

const directory = path.join(project, 'bench/real-repos');
const read = (file: string) => JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
const review = read('reviews.json') as { reviews: { repo: string; commit: string; findingId: string; label: string; reason: string }[] };
const data = repositories.map((repo) => ({ repo, ...read(`runs/${repo.id}.json`) })) as {
  repo: typeof repositories[number]; eligibleCommits: string[]; excludedOutOfMonth: string[]; totalMs: number;
  runs: { commit: string; subject: string; status: string; findings: CheckFinding[] }[];
}[];
const counts = (d: typeof data[number], severity: string) => d.runs.flatMap((r) => r.findings).filter((f) => f.severity === severity).length;
const commitLink = (repo: typeof repositories[number], commit: string) => `[\`${commit.slice(0, 10)}\`](${repo.url.replace(/\.git$/, '')}/commit/${commit})`;
const site = (repo: typeof repositories[number], commit: string, loc: CheckLocation | null) => loc ?
  `[\`${loc.file}:${loc.line}\`](${repo.url.replace(/\.git$/, '')}/blob/${commit}/${loc.file}#L${loc.line}) \`${loc.symbol}\`` : '(none)';
const blocks = data.flatMap((d) => d.runs.flatMap((r) => r.findings.filter((f) => f.severity === 'BLOCK').map((f) => {
  const label = review.reviews.find((a) => a.repo === d.repo.id && a.commit === r.commit && a.findingId === f.id);
  if (!label) throw new Error(`Missing review: ${d.repo.id}:${r.commit}:${f.id}`);
  return { d, r, f, label };
})));
const agrees = blocks.filter((b) => b.label.label === 'agree').length;
const lines = [`# Real-repository history review

**Result: FAIL — ${agrees}/${blocks.length} BLOCK findings agree (${(100 * agrees / blocks.length).toFixed(1)}%), below the required 90%.** These are strict **agent-reviewed** labels, not independent human approval. The Phase 3 real-repository acceptance criterion is **not met**. No thresholds, classifier weights, extraction or runtime candidate rules were changed for this audit.

## Repositories and pinned calendar windows

Only metadata and results are committed, not upstream source or dependencies. Licenses were read at the pinned end trees: got's \`license\` (MIT), Click's \`LICENSE.txt\` (BSD-3-Clause), pytest's \`LICENSE\` (MIT).

Physical tracked TS/JS/Python lines at each end pin, including tests/fixtures: **got 17,524 TS + 423 JS**, **Click 19,645 Python**, **pytest 100,090 Python**. Count with \`git ls-files -z\`, filter those language suffixes, and sum file lines; these are not logical SLOC. Repositories were selected by language, license, size and activity before replay. An ESLint candidate was rejected on size (~548k TS/JS lines), not on findings.

| Repository / role | UTC month | Start boundary (exclusive ancestor) | End boundary (inclusive) |
| --- | --- | --- | --- |`];
for (const repo of repositories) lines.push(`| ${repo.url} — ${repo.role}; ${repo.license} | ${repo.month} | \`${repo.start}\` | \`${repo.end}\` |`);
lines.push(`
The boundary pins are the last first-parent default-branch commits before the first day of the month and before the first day of the following month. A start pin can predate the preceding month when a project is quiet. Got had three February commits (one source fix, README and release); this is a low-activity month, not evidence of broad TypeScript coverage. Click and pytest use July. Each window is one complete UTC calendar month, not a rolling 30-day interval.

## Summary

| Repo | Eligible / checked non-merges | BLOCK | WARN | Agree | Disagree | Agreement | Replay seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
for (const d of data) {
  const labels = blocks.filter((b) => b.d.repo.id === d.repo.id);
  const agree = labels.filter((b) => b.label.label === 'agree').length;
  lines.push(`| ${d.repo.id} | ${d.eligibleCommits.length} / ${d.runs.length} | ${counts(d, 'BLOCK')} | ${counts(d, 'WARN')} | ${agree} | ${labels.length - agree} | ${(100 * agree / labels.length).toFixed(1)}% | ${(d.totalMs / 1000).toFixed(2)} |`);
}
lines.push(`| **Total** | **${data.reduce((s, d) => s + d.eligibleCommits.length, 0)} / ${data.reduce((s, d) => s + d.runs.length, 0)}** | **${blocks.length}** | **${data.reduce((s, d) => s + counts(d, 'WARN'), 0)}** | **${agrees}** | **${blocks.length - agrees}** | **${(100 * agrees / blocks.length).toFixed(1)}%** | **${(data.reduce((s, d) => s + d.totalMs, 0) / 1000).toFixed(2)}** |`);
lines.push(`
All 28 checks completed; **zero unavailable/invalid runs**. All BLOCKs and WARNs were duplicate findings; no dead-code, constant, file or grounding findings were emitted. Reciprocal findings count separately because the CLI emitted them separately. No commit sampling. WARNs are fully recorded, but were not manually labeled; the zero-BLOCK/ten-WARN fallback is not applicable (there are 14 BLOCKs and only nine WARNs).

## Full BLOCK review table

Both sites and their source changes/commit intent were inspected with \`git show <commit>:<file>\` and \`git show <commit>\`. Site links are pinned to the exact checked commit, not the moving branch. A useful shared word or containment is not sufficient: agree requires a real duplicate/dead-code recommendation the author should act on. Full finding IDs, original probabilities, emitted signals, fixes and both locations are retained in [runs/got.json](runs/got.json), [runs/click.json](runs/click.json), [runs/pytest.json](runs/pytest.json); labels and reasons are in [reviews.json](reviews.json).

| # | Repo / commit | Changed symbol / site | Suggested existing symbol / site | p / emitted signals | Agent label | Reason |
| --- | --- | --- | --- | --- | --- | --- |`);
blocks.forEach(({ d, r, f, label }, i) => lines.push(`| B${i + 1} | ${d.repo.id} ${commitLink(d.repo, r.commit)} | ${site(d.repo, r.commit, f.added)} | ${site(d.repo, r.commit, f.existing)} | ${f.probability?.toFixed(3) ?? 'n/a'}; ${f.signals.map((s) => `${s.name}=${s.value.toFixed(3)}`).join(', ')} | **${label.label}** | ${label.reason} |`));
lines.push(`
## Method and reproduction

Dev-only; Git and the GroundWork development dependencies are prerequisites. No upstream dependency installation, upstream test run, upstream source execution or model download occurs.

\`\`\`sh
npm run build
# Default: ~/work/gw-real-repos; must be outside this repository.
export GW_REAL_REPOS_CACHE="$HOME/work/gw-real-repos"
node --import tsx scripts/setup-real-repos.ts
node --import tsx scripts/replay-real-repos.ts
# Copy the three generated results/*.json into bench/real-repos/runs/,
# review each BLOCK into reviews.json, then render:
node --import tsx scripts/render-real-repo-review.ts
\`\`\`

- [repos.json](repos.json) pins URLs, boundary hashes and window metadata; no source is vendored. Setup creates full, no-checkout clones under the external cache and dedicated detached worktrees under \`worktrees/<id>\`, checks origin/pins, refuses tracked edits, and checks out each end pin. It can fetch missing objects only during explicit setup.
- Replay is offline: enumerate \`git log --reverse --topo-order --no-merges <start>..<end>\`, then keep commits whose **committer timestamp** lies in the UTC calendar month. This excludes four Click branch commits made before July but merged during it (their hashes are in \`excludedOutOfMonth\`); merge commits themselves are excluded as requested. There are no such exclusions for got/pytest. Author timestamps are not used.
- For every eligible commit, checkout its tree in the dedicated worktree and launch a fresh \`node /absolute/path/dist/cli/main.js check --base <sole-parent> --json\`. The base is that commit's parent, not the month's start pin. Normal defaults, grounding enabled, **meaning disabled**; no custom config, source exclusions or threshold overrides. Capture every returned BLOCK/WARN without a top-k/report truncation; signals are exactly those exposed by the CLI JSON (not all internal feature values). Exit 1 for BLOCK is expected, not an operational failure.
- Built runtime: GroundWork \`c04b2c299d2c44201271915c969a21208901b300\`, Node \`v24.22.2\`; baseline model SHA-256 is stored in every run file. The no-meaning BLOCK threshold is 0.750969663. No post-review calibration was run. Index and parent-index caches begin cold and are reused naturally across consecutive checks; no separate prewarm. Replay seconds sum fresh check-process wall time plus worktree checkout time, excluding clone, build, metadata lookup, code review and report generation. These are audit runtimes, not hook-latency measurements.
- Full replay was tractable (~4.2 minutes), so all 28 eligible commits were checked. Optional \`--repo=<id>\` and \`--limit=N\` support future reruns; a limit deterministically selects evenly spaced chronological indices including endpoints and is recorded as sampling. Neither was used here.
- The non-quick P3 check reads only these committed artifacts, verifies pins/model hash, run coverage and exactly one label per BLOCK, then requires >=90% agreement. It intentionally **fails on this evidence**, rather than hiding this result or changing thresholds. It skips clearly if the review files are absent. \`--quick\` skips it; no selftest clones/replays or contacts the network. Synthetic offline tests cover passing, failing, empty, missing and invalid evidence.

## Failure modes and separate follow-ups (not implemented)

1. **Containment is not duplication (8/14):** ancestor/descendant pairs share the same source by construction: timedOut/helper, addTimeout/cancel, BoolParamType/convert (both directions), MissingParameter/format_message (both directions), Session/perform_collect (both directions). Exclude overlapping ancestor/descendant spans before scoring; add nested-closure and container hard negatives to an independent follow-up suite.
2. **Incompatible symbol kinds (additional 1/14):** ZshComplete (class) versus FishComplete.get_completion_args (method). Filter callable/container kind compatibility; do not emit a body-replacement fix for a class.
3. **Shared vocabulary without substitutability (remaining 5/14):** cancellation versus firing (both directions), Zsh serialization versus a demo user filter, a progress string versus a boolean predicate, and module-path discovery versus a boolean spec matcher. Require compatible input/output contracts and side-effect roles before blocking; test lifecycle opposites and domain-neighbor negatives on fresh repos/windows, without folding this audit into a claimed held-out test.
4. Preserve lexical scope/capture accessibility when suggesting calls, and deduplicate reciprocal noise for presentation only; neither would justify relabeling these false positives. Some changed symbols are containing classes re-emitted because a descendant changed, not newly introduced code. Calibrating on planted families did not capture this runtime candidate distribution.

This is **not** 90% human agreement or a production-precision success. It measures flagged occurrences only, not recall or unflagged defects. Labels are from one coding agent, sample support is small, months have limited source changes, and no upstream tests were executed. Get an independent human review and evaluate any later fixes on new pinned history before claiming the gate is satisfied.
`);
writeFileSync(path.join(directory, 'review.md'), lines.join('\n') + '\n');
console.log(`Wrote review.md: ${agrees}/${blocks.length} agree; ${(100 * agrees / blocks.length).toFixed(1)}% (agent review).`);

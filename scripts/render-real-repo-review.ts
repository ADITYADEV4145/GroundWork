import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { project, type Repository } from './real-repos.js';
import type { CheckFinding, CheckLocation } from '../src/reuse/check.js';

const root = path.join(project, 'bench/real-repos');
if (!existsSync(path.join(root, 'reviews.json')) && !existsSync(path.join(root, 'step3/freeze.json'))) {
  console.log('skipped: evidence not stored; gate deferred to Benchmark v2');
  process.exit(0);
}
if (existsSync(path.join(root, 'step3/freeze.json'))) {
  await import('./render-step3-review.js');
  process.exit(0);
}
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
interface Row { repo: string; commit: string; findingId: string; label: string; reason: string }
interface Run { commit: string; subject: string; status: string; exitCode: number; findings: CheckFinding[] }
interface Capture { repository: Repository; toolCommit: string; eligibleCommits: string[]; totalMs: number; runs: Run[] }
function load(name: string, directory: string, manifest: string) {
  const repos = read(manifest).repositories as Repository[];
  const captures = repos.map((r) => read(path.join(directory, 'runs', `${r.id}.json`)) as Capture);
  const labels = read(path.join(directory, 'reviews.json')) as { reviews: Row[]; warnings?: Row[] };
  const findings = captures.flatMap((c) => c.runs.flatMap((r) => r.findings.map((f) => ({ c, r, f }))));
  const blocks = findings.filter((x) => x.f.severity === 'BLOCK');
  const agree = labels.reviews.filter((r) => r.label === 'agree').length;
  if (blocks.length !== labels.reviews.length) throw new Error(`${name}: missing BLOCK labels.`);
  return { name, repos, captures, labels, findings, blocks, agree };
}
const before = load('Original before fixes', path.join(root, 'before'), path.join(root, 'before/repos.json'));
const original = load('Original re-run', root, path.join(root, 'repos.json'));
const heldout = load('Held-out', path.join(root, 'heldout'), path.join(root, 'heldout-repos.json'));
const rate = (agree: number, count: number) => count ? `${(100 * agree / count).toFixed(1)}%` : 'n/a (zero BLOCKs)';
const url = (repo: Repository) => repo.url.replace(/\.git$/, '');
const commit = (repo: Repository, hash: string) => `[\`${hash.slice(0, 10)}\`](${url(repo)}/commit/${hash})`;
const site = (repo: Repository, hash: string, loc: CheckLocation | null) => loc ?
  `[\`${loc.file}:${loc.line}\`](${url(repo)}/blob/${hash}/${loc.file}#L${loc.line}) \`${loc.symbol}\`` : '(none)';
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const totalBlocks = original.blocks.length + heldout.blocks.length;
const totalAgree = original.agree + heldout.agree;
const passed = totalBlocks > 0 && heldout.blocks.length > 0 && totalAgree / totalBlocks >= 0.9 && heldout.agree / heldout.blocks.length >= 0.9;
const lines = [`# Real-repository history review: before, re-run and held-out

**Result: ${passed ? 'observed agreement threshold met' : 'acceptance gate NOT met'}.** Original before fixes: **0/14 agree (0%)**. After frozen fixes: original **${original.agree}/${original.blocks.length}**, held-out **${heldout.agree}/${heldout.blocks.length} (${rate(heldout.agree, heldout.blocks.length)})**, combined **${totalAgree}/${totalBlocks} (${rate(totalAgree, totalBlocks)})**. All labels are **agent-reviewed**, not independent human approval. ${totalBlocks < 10 ? `Only **${totalBlocks} BLOCK findings total**: too little support for a robust precision claim. Ten WARNs per post-fix set are spot-checked below.` : ''} No additional detector/model changes were made after observing either post-fix replay.

## Freeze and principled changes

Detection code, calibrated models and held-out boundary pins were frozen in **50412e5** before running either post-fix replay. Every post-fix capture records that tool commit and its model hash. Held-out months were selected using Git activity metadata only; no held-out checker results were inspected before the freeze. Got July 2024 has six non-merge commits versus three in the original February month, including source changes (not merely a release-only month).

1. Never compare same-file ancestor/descendant symbols: either a containing byte range or dotted qualified-name ancestry establishes dependence. A container includes its children's text; shared text is not independent evidence of a duplicate. Applied in candidate retrieval, in both directions.
2. BLOCK only compatible implementation families: class/class (dataclasses are classes), or function/method with function/method. A class is not substitutable by one method. Constants and file checks are unchanged. Incompatible-kind pairs can remain advisory WARNs.
3. BLOCK requires normalized or binding-aware exact equality, or **structure >= 0.5** (majority structural shingles). Vocabulary, signature similarity or meaning alone cannot establish a replacement. The boundary was fixed from that first-principles requirement, not searched against real-repo labels. Preserve raw WARN probabilities; an eligible BLOCK candidate outranks an ineligible higher-probability neighbor.
4. Recalibrate with the same 510 labels, families and folds, applying eligibility at OOF selection. Filtered positives stay in the recall denominator. Preserve the pre-policy confidence floor **0.750969663** so stricter eligibility cannot promote old medium-confidence warnings. An initial unconstrained labeled-set recalibration (~0.606 cutoff) regressed an existing changed-boundary negative test; the floor corrects that regression, without consulting post-fix history. No corpus labels/sources or extractor output/schema changed.

## Labeled-set precision and recall cost

| Classifier | Before TP / FP | Before precision / recall | After TP / FP | After precision / recall | Recall cost |
| --- | ---: | --- | ---: | --- | ---: |
| Default | 140 / 7 | 95.24% / 57.61% | 73 / 3 | 96.05% / 30.04% | 27.57 percentage points |
| Meaning (selected model) | 140 / 7 | 95.24% / 57.61% | 73 / 3 | 96.05% / 30.04% | 27.57 percentage points |

Both remain above 95% OOF BLOCK precision. Type 1 recall remains 100%; Type 2 95.83%; Type 3 falls from 30.56% to **4.17%**; Type 4 from 48.48% to **0%**. This is a severe semantic-clone recall cost, not a free precision improvement. Original regression floors of 50% overall / 25% Type 3 recall were replaced with the explicitly reported calibrated recall and exact 3/72 Type 3, 0/99 Type 4 expectations; they would be incompatible with this policy. Candidate MiniLM/BGE/Jina now tie on 73 TP/3 FP; MiniLM wins the existing size tiebreak. The consented default follows the calibrated model id, but configured old models are not silently downloaded/replaced. [Full calibration](../dupes/report.md), [meaning candidates](../dupes/embeddings.md).

## Pinned repositories and calendar windows

Licenses read from pinned trees: got MIT (\`license\`), Click BSD-3-Clause (\`LICENSE.txt\`), pytest MIT (\`LICENSE\`). Original end-tree physical tracked language lines, including tests/fixtures: got 17,524 TS + 423 JS; Click 19,645 Python; pytest 100,090 Python. No upstream source or dependencies are committed. Start pins are exclusive ancestors before the UTC month; end pins inclusive before the next month. A quiet month's start can be considerably older.

| Set / repo | URL / role | UTC month | Start pin | End pin |
| --- | --- | --- | --- | --- |`];
for (const set of [original, heldout]) for (const r of set.repos) lines.push(`| ${set.name} / ${r.id} | ${r.url} — ${r.role} | ${r.month} | \`${r.start}\` | \`${r.end}\` |`);
lines.push(`
## Per-repository results

Runtime is summed fresh check-process wall time plus checkout time, not a hook benchmark. The original before/after cache states differ; do not interpret their runtime difference as a speedup. No deliberate prewarm or cache deletion; existing index/parent caches are reused naturally. No sampling.

| Set / repo | Eligible / checked | BLOCK | WARN | Agree | Disagree | Agreement | Replay seconds |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |`);
for (const set of [before, original, heldout]) {
  for (const c of set.captures) {
    const fs = set.findings.filter((x) => x.c.repository.id === c.repository.id);
    const b = fs.filter((x) => x.f.severity === 'BLOCK').length;
    const agree = set.labels.reviews.filter((r) => r.repo === c.repository.id && r.label === 'agree').length;
    lines.push(`| ${set.name} / ${c.repository.id} | ${c.eligibleCommits.length} / ${c.runs.length} | ${b} | ${fs.length - b} | ${agree} | ${b - agree} | ${rate(agree, b)} | ${(c.totalMs / 1000).toFixed(2)} |`);
  }
}
for (const set of [before, original, heldout]) {
  lines.push(`
## ${set.name}: full BLOCK review table

${set.blocks.length ? '' : 'Zero BLOCKs; agreement is undefined, not 100%. No positive acceptance evidence from this set.'}

| Repo / commit | Changed symbol / site | Existing symbol / site | p / emitted signals | Agent label | Reason |
| --- | --- | --- | --- | --- | --- |`);
  for (const { c, r, f } of set.blocks) {
    const row = set.labels.reviews.find((x) => x.repo === c.repository.id && x.commit === r.commit && x.findingId === f.id);
    if (!row) throw new Error(`Unreviewed BLOCK ${f.id}`);
    lines.push(`| ${c.repository.id} ${commit(c.repository, r.commit)} | ${site(c.repository, r.commit, f.added)} | ${site(c.repository, r.commit, f.existing)} | ${f.probability?.toFixed(3) ?? 'n/a'}; ${f.signals.map((s) => `${s.name}=${s.value.toFixed(3)}`).join(', ')} | **${row.label}** | ${esc(row.reason)} |`);
  }
}
for (const set of [original, heldout]) {
  lines.push(`
## ${set.name}: WARN spot-checks

Selection: round-robin got, Click, pytest, consuming WARNs in replay/finding order until ten (skip exhausted repositories). These are diagnostics, not BLOCK precision and not tuning data. Both sites inspected at the exact commit. No source snippets are vendored.

| Repo / commit | Changed site / symbol | Existing site / symbol | Agent label | Reason |
| --- | --- | --- | --- | --- |`);
  for (const row of set.labels.warnings ?? []) {
    const item = set.findings.find((x) => x.c.repository.id === row.repo && x.r.commit === row.commit && x.f.id === row.findingId && x.f.severity === 'WARN');
    if (!item) throw new Error(`Unknown WARN review ${row.findingId}`);
    lines.push(`| ${row.repo} ${commit(item.c.repository, row.commit)} | ${site(item.c.repository, row.commit, item.f.added)} | ${site(item.c.repository, row.commit, item.f.existing)} | ${row.label} | ${esc(row.reason)} |`);
  }
}
lines.push(`
## Reproduction, provenance and gate

\`\`\`sh
npm run build
export GW_REAL_REPOS_CACHE="$HOME/work/gw-real-repos"
node --import tsx scripts/setup-real-repos.ts
node --import tsx scripts/replay-real-repos.ts
# Copy external results/*.json into bench/real-repos/runs/.
export GW_REAL_REPOS_MANIFEST="$PWD/bench/real-repos/heldout-repos.json"
export GW_REAL_REPOS_RESULTS="$GW_REAL_REPOS_CACHE/heldout-results"
node --import tsx scripts/setup-real-repos.ts
node --import tsx scripts/replay-real-repos.ts
# Copy heldout-results/*.json into bench/real-repos/heldout/runs/.
# Strictly review every BLOCK and ten WARNs per set into each reviews.json.
node --import tsx scripts/render-real-repo-review.ts
\`\`\`

Original before-fix artifacts and labels are preserved byte-for-byte under [before/](before/); the [prior table](before/review.md) is not silently replaced. Post-fix artifacts: [original runs](runs/), [original labels](reviews.json), [held-out runs](heldout/runs/), [held-out labels](heldout/reviews.json). Every raw BLOCK/WARN includes commit, parent, both file/line/symbol locations, all CLI-emitted signals, probability/fix, exit status and process runtime. Signals are those emitted by CLI JSON, not every internal feature. All per-commit captures, including clean checks, are committed.

Enumerate \`git log --reverse --topo-order --no-merges <start>..<end>\` and retain **committer timestamps** in the UTC calendar month. Older side-branch commits merged during the month are explicitly listed as excluded; merge commits themselves are excluded. Checkout each selected commit in a dedicated external detached worktree and invoke a fresh built \`node /absolute/path/dist/cli/main.js check --base <sole-parent> --json\`. Normal defaults, grounding enabled, **meaning disabled** for both history sets; no threshold/config/source overrides, dependency installation, model download, upstream code execution or upstream test run. Node v24.22.2. Exit 1 for BLOCK is expected, not an operational error. No sampling or unavailable runs may be hidden; raw captures retain any failures.

The non-quick P3 gate reads committed final evidence only. It checks pins, model hashes, complete selected-run coverage and exactly one strict label per BLOCK. It requires **both combined and held-out agreement >=90%**, equivalently whichever is stricter; zero BLOCKs do not yield a vacuous pass. Missing review files skip clearly; malformed/incomplete held-out evidence fails. It never clones or runs the checker. The separate non-quick Stop latency gate is unchanged. No claim of independent human acceptance is made.

## Honest stopping point and remaining modes

The eight observed containment false BLOCKs are structurally impossible now; incompatible kinds and vocabulary-only matches no longer BLOCK. The remaining held-out BLOCK is got's Options.request versus Options.encoding setters: they update different fields and validate different types, and the commit only updates assertion-library API names. Inspecting the frozen index at the same options.ts content gives structure **0.5390625**, exact **0**, bindingExact **0**, so it passes the predeclared majority-structure guard despite not being substitutable. Raising that boundary to suppress this row would fit to held-out results; it was not done. The generic guard is insufficient evidence of a compatible side-effect contract.

Normalized exact matches can also conceal policy/literal differences; an eligible alternative can be inappropriate to call from the proposed scope. WARNs retain many such low-quality recommendations, and their assertive replacement wording remains a separate UX limitation. All twenty spot-checks disagreed with the proposed replacement; these are diagnostic findings, not BLOCK precision or proof of recall. Spot-check labels describe actual instances above, not hypothetical successes.

No second detector adjustment was made after seeing these replays. If agreement/support is insufficient, stop here rather than chase this review set. Future work requires independent contract/side-effect evidence or better independently labeled data and new held-out history, not adding exceptions for these repositories or moving the thresholds until their rows pass. This audit measures flagged occurrences, not recall over real commits; no unflagged defects were exhaustively labeled. The substantial labeled-set recall loss and limited support must accompany any precision claim.
`);
writeFileSync(path.join(root, 'review.md'), lines.join('\n').trimEnd() + '\n');
console.log(`Review: original ${original.agree}/${original.blocks.length}; held-out ${heldout.agree}/${heldout.blocks.length}; combined ${totalAgree}/${totalBlocks}. ${passed ? 'Observed agreement threshold met' : 'Acceptance gate NOT met'}.`);

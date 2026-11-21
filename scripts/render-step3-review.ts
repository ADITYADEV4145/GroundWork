import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { project } from './real-repos.js';
import { evaluateExpandedReview, wilson } from '../src/selftest/real-repo-review.js';
import type { CheckFinding } from '../src/reuse/check.js';

const root = path.join(project, 'bench/real-repos');
const read = (f: string) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
type Review = { repo: string; commit: string; findingId: string; label: string; reason: string; reuseOrExtendLabel: string; reuseOrExtendReason: string };
type Item = { set: string; repo: string; url: string; commit: string; finding: CheckFinding; review: Review };
const items: Item[] = [], tables: string[] = [];
const sets = ['original', 'heldout', 'new-1', 'new-2'];
const pct = (a: number, n: number) => n ? (100 * a / n).toFixed(1) + '%' : 'undefined (0/0)';
const ci = (a: number, n: number) => wilson(a, n)?.map((v) => (100 * v).toFixed(1) + '%').join('–') ?? 'undefined';
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const site = (x: Item, loc = x.finding.added) => loc ? `[\`${loc.symbol ?? loc.file}\`](${x.url}/blob/${x.commit}/${loc.file}#L${loc.line})` : '(none)';
for (const set of sets) {
  const reviews = read(`step3/${set}/reviews.json`) as { reviews: Review[] };
  for (const repo of ['got', 'click', 'pytest']) {
    const data = read(`step3/${set}/runs/${repo}.json`);
    const blocks: Item[] = data.runs.flatMap((r: { commit: string; findings: CheckFinding[] }) => r.findings.filter((f) => f.severity === 'BLOCK').map((finding) => {
      const review = reviews.reviews.find((v) => v.repo === repo && v.commit === r.commit && v.findingId === finding.id);
      if (!review) throw new Error('Missing BLOCK review');
      return { set, repo, commit: r.commit, url: data.repository.url.replace(/\.git$/, ''), finding, review };
    }));
    items.push(...blocks);
    const n = blocks.length, a = blocks.filter((b) => b.review.reuseOrExtendLabel === 'agree').length;
    const warnings = data.runs.reduce((n: number, r: { findings: CheckFinding[] }) => n + r.findings.filter((f) => f.severity === 'WARN').length, 0);
    const unavailable = data.runs.filter((r: { status: string; exitCode: number }) => r.status === 'UNAVAILABLE' || r.exitCode !== (r.status === 'BLOCK' ? 1 : 0)).length;
    tables.push(`| ${set} | ${repo} / ${data.repository.month} | ${data.runs.length}/${data.eligibleCommits.length} | ${n} | ${a} | ${pct(a, n)}; ${ci(a, n)} | ${warnings} | ${unavailable} | ${(data.totalMs / 1000).toFixed(2)} s | not independently enumerable |`);
  }
}
const legacy = read('step3/legacy-reuse-reviews.json') as { reviews: (Review & { set: string })[] };
const legacyItems: Item[] = legacy.reviews.map((review) => {
  const data = read(`${review.set}/runs/${review.repo}.json`);
  const finding = data.runs.find((r: { commit: string }) => r.commit === review.commit).findings.find((f: CheckFinding) => f.id === review.findingId);
  return { set: `historical ${review.set}`, repo: review.repo, url: data.repository.url.replace(/\.git$/, ''), commit: review.commit, finding, review };
});
const warns = read('step3/warn-reviews.json') as { reviews: (Review & { set: string; finding: CheckFinding; addedHash: string; existingHash: string | null })[] };
const gate = evaluateExpandedReview(root);
const calibration = JSON.parse(readFileSync(path.join(project, 'bench/real-history/calibration.json'), 'utf8'));
const introductions = JSON.parse(readFileSync(path.join(project, 'bench/real-history/introduction-recall.json'), 'utf8'));
const introductionReviews = JSON.parse(readFileSync(path.join(project, 'bench/real-history/introduction-reviews.json'), 'utf8'));
const positives = read('step3/positive-reviews.json');
const freeze = read('step3/freeze.json');
const introBlocks = read('step3/intro-block-reviews.json') as { reviews: (Review & { set: string; finding: CheckFinding })[] };
const introItems: Item[] = introBlocks.reviews.map((r) => ({ set: r.set, repo: r.repo, url: 'https://github.com/vitejs/vite', commit: r.commit, finding: r.finding, review: r }));
const archiveMarker = '\n<!-- archived-step-two -->\n';
const old = readFileSync(path.join(root, 'review.md'), 'utf8');
const archive = old.includes(archiveMarker) ? old.split(archiveMarker)[1]! : old;
const newRows = items.map((x) => `| ${x.set} / ${x.repo} | [${x.commit.slice(0, 10)}](${x.url}/commit/${x.commit}) | ${site(x)} → ${site(x, x.finding.existing!)} | ${x.review.label} | ${x.review.reuseOrExtendLabel}: ${esc(x.review.reuseOrExtendReason)} |`);
const lines = [`# Step-three frozen contract detector: agent-reviewed history

**${gate.ok ? 'Observed agreement threshold met' : 'Acceptance gate NOT met'}.** ${gate.detail}

This is agent review, not human approval. Occurrence precision and its Wilson interval describe flagged commits in these selected pinned months, not an independent population estimate; repeated edits of one pair are correlated. Unavailable runs are not negatives. The target of at least 20 held-out BLOCKs is descriptive support, not a threshold silently lowered to claim success. Empty denominators are undefined.

## Frozen protocol and classifier

Review standard committed first in 0138d34: [REUSE or EXTEND](../real-history/review-standard.md). Detector/models/windows frozen in **${freeze.modelCommit}**, before all current captures; model SHA-256 ${freeze.modelHash}. No detector/model/retrieval/threshold tuning after replay. The original and former held-out months were previously inspected; only the two additional consecutive months per repo were untouched evaluation. The held-out aggregate includes all three designated held-out months per repo; it is not all fresh evidence.

[Calibration](../real-history/calibration.md): planted ${calibration.planted.tp} TP / ${calibration.planted.fp} FP, precision ${pct(calibration.planted.tp, calibration.planted.tp + calibration.planted.fp)}, recall ${pct(calibration.planted.tp, calibration.planted.support)}. Combined ${calibration.tp}/${calibration.tp + calibration.fp}; dev-only ${calibration.development.tp}/${calibration.development.tp + calibration.development.fp}. Planted clone recall: ${calibration.byType.map((r: { type: number; tp: number; support: number }) => `Type ${r.type} ${r.tp}/${r.support} (${pct(r.tp, r.support)})`).join('; ')}. Pre-replay non-quick Stop: p50 179.23 ms, p95 **215.84 ms**, 35 fresh processes including startup, all really blocked under strict; default standard uses the same computation but only warns. [Freeze notes](../real-history/pre-replay.md).

## All current captures

| Set | Repository / UTC month | Checked / eligible | BLOCK | Agree | Precision; Wilson 95% | WARN | Unavailable | Runtime incl. checkout | Recall |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
${tables.join('\n')}

Held-out total: **${gate.metrics?.heldoutAgree}/${gate.metrics?.heldoutBlocks}**; ${pct(gate.metrics?.heldoutAgree ?? 0, gate.metrics?.heldoutBlocks ?? 0)}, Wilson 95% ${ci(gate.metrics?.heldoutAgree ?? 0, gate.metrics?.heldoutBlocks ?? 0)}. Full captures, pins and exit codes are under step3/. Every eligible non-merge commit was checked; no finding-dependent sampling.

## Current BLOCK reviews: strict and new-standard columns

| Set / repo | Commit | Added → proposed X | Strict substitution | Reuse-or-extend / one-line reason |
| --- | --- | --- | --- | --- |
${newRows.join('\n') || '| All current sets | — | No BLOCKs emitted | — | Undefined precision, not a pass |'}

## Historical BLOCKs re-reviewed, strict labels untouched

Original raw captures and strict reviews remain byte-identical in before/, runs/ and heldout/. The sidecar step3/legacy-reuse-reviews.json adds the frozen-standard verdict, rather than overwriting history. These older classifier findings do not count as current-detector precision support.

| Historical set / repo | Commit | Added → proposed X | Strict label | Reuse-or-extend / one-line reason |
| --- | --- | --- | --- | --- |
${legacyItems.map((x) => `| ${x.set} / ${x.repo} | ${x.commit.slice(0, 10)} | ${site(x)} → ${site(x, x.finding.existing!)} | ${x.review.label} | ${x.review.reuseOrExtendLabel}: ${esc(x.review.reuseOrExtendReason)} |`).join('\n')}

## WARN spot-checks

Ten per repo, deterministically evenly spaced across chronological WARN occurrences over all four sets, including endpoints (or all if fewer). Neither WARNs nor unknowns are BLOCK precision evidence. Both sites were inspected; source-span hashes are in step3/warn-reviews.json. Raw source stays in the external cache.

| Repo / set | Commit | Added → proposed X | Agent reuse-or-extend verdict / reason |
| --- | --- | --- | --- |
${warns.reviews.map((r) => { const x = { set: r.set, repo: r.repo, url: `https://github.com/${r.repo === 'got' ? 'sindresorhus/got' : r.repo === 'click' ? 'pallets/click' : 'pytest-dev/pytest'}`, commit: r.commit, finding: r.finding, review: r }; return `| ${r.repo} / ${r.set} | ${r.commit.slice(0, 10)} | ${site(x)} → ${site(x, x.finding.existing!)} | ${r.reuseOrExtendLabel}: ${esc(r.reuseOrExtendReason)} |`; }).join('\n')}

## Recall, with explicit denominators

${introductionReviews.summary}

| Dev family | Introduction candidate | Reviewed duplicate introduction? | Available replay? | Pair BLOCK? | Reason |
| --- | --- | --- | --- | --- | --- |
${introductions.rows.map((r: any) => { const review = introductionReviews.reviews.find((v: any) => v.family === r.family); return `| ${r.family} | ${r.introduction?.slice(0, 12) ?? 'unverified'} | ${review.verified ? 'yes' : 'unverified'} | ${r.replay?.status ?? 'not run'} | ${review.verified && r.replay?.status !== 'UNAVAILABLE' ? String(r.replay?.familyBlocked ?? false) : 'not estimated'} | ${esc(review.reason)} |`; }).join('\n')}

${positives.summary}

All ${introItems.length} unique BLOCKs from the available dev introduction replays were also reviewed (two captures of one Vite commit deduplicated): ${introItems.filter((r) => r.review.reuseOrExtendLabel === 'agree').length}/${introItems.length} agree. This is in-sample development evidence, NOT held-out precision/support. The non-pair flags include constant-role collisions and framework-specific grounding limitations. Labels and source-span hashes are in step3/intro-block-reviews.json; no model changes followed them.

All held-out commits were also passed through the existing development consolidation miner with separate reserved-repo paths/output, after the detector freeze. Its raw proposals are under step3/mining/. Labels/reasons and any source pairs are in step3/positive-reviews.json. Mining is incomplete, proposals are not automatically positive, and no positives were used to fit or tune. WARN spot-checks are another limited discovery route, not exhaustive recall. Pair sensitivity for a known pre-consolidation pair is not end-to-end introduction recall.

## Human audit and reproduction

[Human review sheet](human-review.md) has one row per current, historical or supplemental dev-introduction BLOCK, links to commit/both source sites, proposed X, the claim and an intentionally empty human verdict. Development and historical rows do not increase held-out support. Grounding rows retain their actual grounding claim rather than being mislabeled duplicates. No human agreement is claimed.

Build once; for each frozen manifest run scripts/replay-real-repos.ts with GW_REAL_REPOS_MANIFEST and GW_REAL_REPOS_RESULTS pointing to the corresponding step3/<set>/runs directory. Do not change coefficients or thresholds. scripts/capture-step3-sites.ts selects the review sites; review them before writing the separate labels. scripts/mine-heldout-history.ts <set> reuses the miner. scripts/real-history-introductions.ts --replay audits origin candidates; source review is mandatory before counting a birth. Run scripts/render-real-repo-review.ts to regenerate this report. The non-quick stored-evidence gate validates all four complete captures, distinct commits, consecutive new pins, classifier/standard hashes and frozen detector commit; it requires both held-out and combined agreement >=90%, and fails with zero BLOCKs. Runtime stays offline; no upstream code/tests were executed.
`];
writeFileSync(path.join(root, 'review.md'), lines.join('\n') + archiveMarker + '# Archived earlier-detector report (not current-model evidence)\n\n' + archive.replace(/^# Archived earlier-detector report \(not current-model evidence\)\n\n/, ''));
writeFileSync(path.join(root, 'human-review.md'), `# Human review: BLOCK claims\n\nAgent-reviewed evidence is separate. The final column is intentionally empty. Historical rows were not emitted by the new classifier.\n\n| Set / repo | Commit | Added implementation | Proposed X | One-line claim | Human agree / disagree |\n| --- | --- | --- | --- | --- | --- |\n${[...items, ...legacyItems, ...introItems].map((x) => `| ${x.set} / ${x.repo} | [${x.commit.slice(0, 10)}](${x.url}/commit/${x.commit}) | ${site(x)} | ${site(x, x.finding.existing!)} | ${x.finding.kind === 'grounding' ? esc(x.finding.fix) : `Duplicate of ${esc(x.finding.existing?.symbol ?? x.finding.existing?.file ?? 'X')}: REUSE or EXTEND X instead of keeping both.`} | |`).join('\n')}\n`);
console.log(gate.detail);

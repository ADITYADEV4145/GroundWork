import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, evidenceDir, type Ref } from './real-history-dev.js';
import { separation, type Observation } from './render-real-history-dev.js';
import type { ActionClass } from './real-history-diagnose.js';
import manifest from '../bench/real-history/dev/repos.json' with { type: 'json' };

export const actions: ActionClass[] = ['direct-reuse', 'extract/extend', 'related-different', 'unknown'];
export function actionSeparation<T extends { review: { family: string; actionClass: ActionClass } }>(rows: readonly T[], action: ActionClass, field: (r: T) => number | null | undefined, direction = 1) {
  if (action === 'related-different') throw new Error('related-different is the reference class');
  const selected = rows.filter((r) => r.review.actionClass === action || r.review.actionClass === 'related-different');
  return separation(selected.map((r) => ({ row: r, review: { family: r.review.family, label: r.review.actionClass === action ? 'positive' as const : 'negative' as const } })), (r) => field(r.row), direction);
}

const load = <T>(name: string): T => JSON.parse(readFileSync(path.join(evidenceDir, name), 'utf8')) as T;
const save = (name: string, value: unknown) => writeFileSync(path.join(evidenceDir, name), JSON.stringify(value, null, 2) + '\n');
const fmt = (n: number | null) => n === null ? '—' : n.toFixed(3);
const featureNames = ['reads', 'writes', 'calls', 'returnShape', 'arity', 'parameterUse', 'exceptions', 'validation', 'earlyReturns', 'sameFile', 'verbOpposition', 'writePresenceMismatch', 'literals'];
export function renderActions() {
  const rows = manifest.repos.flatMap((r) => load<Observation[]>(`${r.id}-features.json`));
  const labels = load<{ id: string; actionClass: ActionClass }[]>('labels.json');
  if (rows.length !== labels.length || new Set(rows.map((r) => r.id)).size !== rows.length || labels.some((l) => !rows.some((r) => r.id === l.id && r.review.actionClass === l.actionClass))) throw new Error('Features must exactly cover action labels');
  const families = [...new Set(rows.map((r) => r.review.family))].map((id) => {
    const members = rows.filter((r) => r.review.family === id), first = members[0]!;
    if (members.some((r) => r.review.actionClass !== first.review.actionClass || r.repo !== first.repo || r.commit !== first.commit)) throw new Error(`Inconsistent family ${id}`);
    return { id, repo: first.repo, commit: first.commit, actionClass: first.review.actionClass!, reviewer: 'agent-reviewed', representative: first.id,
      members: members.map((r) => r.id), reason: [...new Set(members.map((r) => r.review.reason))].join(' / ') };
  });
  const counts = (rs: typeof families) => Object.fromEntries(actions.map((a) => [a, rs.filter((r) => r.actionClass === a).length]));
  const callable = rows.filter((r) => !r.current.related && r.current.compatible);
  const metrics = (fields: string[], population: Observation[], getter: (r: Observation, f: string) => number | null | undefined) => fields.map((feature) => {
    const stat = (a: ActionClass) => actionSeparation(population, a, (r) => getter(r, feature), ['verbOpposition', 'writePresenceMismatch'].includes(feature) ? -1 : 1);
    return { feature, 'direct-reuse': stat('direct-reuse'), 'extract/extend': stat('extract/extend'), unknown: stat('unknown') };
  });
  const contracts = metrics(featureNames, callable, (r, f) => r.features[f]);
  const signals = metrics(Object.keys(rows[0]!.current.signals), rows, (r, f) => r.current.signals[f]);
  const repos = manifest.repos.map((repo) => {
    const mine = load<{ commits: unknown[]; proposals: { commit: string }[]; skippedOversize?: string[] }>(`${repo.id}-mining.json`);
    const normal = load<{ sampling: string; runs: { ms: number; report: { status: string; findings: { kind: string; severity: string }[] } }[] }>(`${repo.id}-normal.json`);
    return { ...repo, startUtc: repo.startUtc ?? manifest.startUtc, endUtcExclusive: repo.endUtcExclusive ?? manifest.endUtcExclusive,
      commitsSearched: mine.commits.length, proposals: mine.proposals.length, proposalEvents: new Set(mine.proposals.map((p) => p.commit)).size,
      oversizeSourceVersionsSkipped: mine.skippedOversize?.length ?? 0,
      familyCounts: counts(families.filter((f) => f.repo === repo.id)), pairCounts: counts(rows.filter((r) => r.repo === repo.id).map((r) => ({ ...families.find((f) => f.id === r.review.family)! }))),
      normalSampling: normal.sampling, normalRuns: normal.runs.length, unavailable: normal.runs.filter((r) => r.report.status === 'UNAVAILABLE').length,
      legacyDuplicatePairs: normal.runs.flatMap((r) => r.report.findings).filter((f) => f.kind === 'duplicate').length };
  });
  const total = counts(families), positives = total['direct-reuse']! + total['extract/extend']!;
  const tsFamilies = families.filter((f) => ['direct-reuse', 'extract/extend'].includes(f.actionClass) && rows.find((r) => r.id === f.representative)!.a.file.match(/\.tsx?$/)).length;
  const summary = { purpose: 'Evidence only; agent-reviewed, not human-approved; no model/rule fitted or held-out evaluation.',
    searchedCommits: repos.reduce((n, r) => n + r.commitsSearched, 0), proposalCount: repos.reduce((n, r) => n + r.proposals, 0),
    familyCounts: total, positiveFamilies: positives, tsPositiveFamilies: tsFamilies, directReuseFamilies: total['direct-reuse'], targets: { positiveFamilies: 20, tsPositiveFamilies: 6, directReuseFamilies: 8 },
    repos, contracts, signals, sourceHashes: Object.fromEntries(['src/reuse/model.json', 'src/reuse/signals.ts', 'src/reuse/policy.ts', 'scripts/real-history-features.ts', 'bench/real-history/dev/labels.json'].map((f) => [f, digest(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))])) };
  save('families.json', families); save('summary.json', summary);
  type Stat = ReturnType<typeof separation>;
  const table = (xs: typeof contracts) => ['| Feature | Direct reuse vs related-different | Extract/extend vs related-different | Unknown vs related-different |', '| --- | ---: | ---: | ---: |',
    ...xs.map((x) => `| ${x.feature}${['verbOpposition', 'writePresenceMismatch'].includes(x.feature) ? ' ↓' : ''} | ${(['direct-reuse', 'extract/extend', 'unknown'] as const).map((a) => { const s: Stat = x[a]; return `${fmt(s.familyAuc)} (${s.positiveAvailable}/${s.negativeAvailable})`; }).join(' | ')} |`)].join('\n');
  const text = `# Expanded development history: action-class evidence

**Evidence only. Agent-reviewed, not human-approved. No detector, weights, thresholds or reserved evaluation changed.**

## Targets and search yield

Searched **${summary.searchedCommits} distinct non-merge commits** across nine pinned permissive TS/Python repositories (1,972 from step 1; the rest new). Found **${summary.proposalCount} raw proposals**, not labels. Stopping at the requested approximately 6k-commit search budget: **${positives}/20 positive families, ${tsFamilies}/6 TS positive families, ${total['direct-reuse']}/8 unchanged direct-reuse families**. These targets are **not met**. Pair combinations never count as separate families. Proposals are not exhaustively reviewed: only the families below carry reviewed labels. The production-path heuristic also admits test infrastructure under TypeScript's src/testRunner; raw proposal counts must not be read as production-only yield.

| Repository / window (UTC, end exclusive) | Start / end pins | Commits | Proposals (events) | Direct / extract / different / unknown families |
| --- | --- | ---: | ---: | ---: |
${repos.map((r) => `| [${r.id}](${r.url}), ${r.startUtc.slice(0, 10)}–${r.endUtcExclusive.slice(0, 10)} / ${r.license} | \`${r.start}\`<br>\`${r.end}\` | ${r.commitsSearched} | ${r.proposals} (${r.proposalEvents}) | ${actions.map((a) => r.familyCounts[a]).join(' / ')} |`).join('\n')}

The unchanged step-1 five-repo window remains January–June 2025. TypeScript, Vite and Vue add January 2024–June 2025; pandas adds January–June 2025. Source lives externally under \`GW_REAL_HISTORY_CACHE\`. TypeScript's first unbounded attempt was stopped for cost; the completed search skips files above its manifest's 200,000-byte cap (**${repos.find((r) => r.id === 'typescript')!.oversizeSourceVersionsSkipped} distinct revision:file versions**). This includes large compiler files such as checker.ts: commit metadata was searched, **not every function in those files**. Parse failures, short bodies and name-only callee matching further limit mining recall. No stronger full-source coverage is claimed.

## Family labels and deduplication

[families.json](families.json) defines one representative and all member IDs per family. Positive events are deduplicated by repository/commit, including the 21 correlated backend pairs as one family. Negatives group conservatively by normal commit. Every labelled pair and one-line reason is in [pairs.md](pairs.md); exact references/hashes and action labels are in the JSON files. The backend family is vendored array-api-compat code with its own MIT license.

| Family | Repo / commit | Action | Reason (representative) |
| --- | --- | --- | --- |
${families.map((f) => `| ${f.id} | ${f.repo} / \`${f.commit.slice(0, 12)}\` | ${f.actionClass} | ${rows.find((r) => r.id === f.representative)!.review.reason.replace(/\|/g, '\\|')} |`).join('\n')}

Direct reuse is not inferred from a commit subject or shortened body: it requires an existing target with unchanged source hash/identity, an explicit after-caller witness, and review of argument, return, validation and effect compatibility. A new shared module is extraction, even if its copied body is identical. Unknown denotes withheld supervision, not a negative. The Vue expression-only extraction is withheld because it does not prove whole-function interchangeability; the Pydantic move is withheld because two similar functions move separately instead of merging.

## Matching permissive-detector negatives and missing support

| Repo | Normal commits replayed | Unavailable | Duplicate candidates | Reviewed related-different pairs | Both positive and negative families? |
| --- | ---: | ---: | ---: | ---: | --- |
${repos.map((r) => `| ${r.id} | ${r.normalRuns} | ${r.unavailable} | ${r.legacyDuplicatePairs} | ${r.pairCounts['related-different']} | ${r.familyCounts['related-different']! > 0 && r.familyCounts['direct-reuse']! + r.familyCounts['extract/extend']! > 0 ? 'yes' : '**no**'} |`).join('\n')}

New normal samples use the two smallest SHA-256(normal-v1:commit) eligible non-keyword production-changing commits, independently of findings. Original sampling and unavailable runs are preserved. Unavailable is never a clean negative, and unreviewed candidates are never labelled automatically. Both-sides support per repo is **also incomplete**, as shown above; this is a stopped search, not a training-ready corpus.

## Family-balanced separation by action class

Each cell is **family-balanced AUC (observed target/reference pairs)**. Each family has unit weight among available values. Ties count half; missing unions/shapes/usage ratios are omitted and coverage is shown. Higher similarity is oriented positive; ↓ inverts mismatch/opposition. No direction or cutoff was fitted. Contract comparison excludes current related/ancestor and incompatible-kind pairs; current default signal comparison includes all labelled pairs. Unknown is shown descriptively only and is not training truth. No direct positives means undefined direct AUC, not 0.5 or 1.

### Proposed contracts

${table(contracts)}

### Frozen current default signals

${table(signals)}

**Direct-reuse versus related-different does not have enough reviewed support to establish a precision-first BLOCK rule.** AUC is not precision, and selected case-control prevalence cannot estimate deployment precision. Extract/extend is a different action and must not supply missing direct-reuse positives. Writes/exceptions have sparse support, same-file/repository/language are confounded, and unknown syntactic effects remain unknown. No threshold search or new BLOCK policy was performed. Held-out precision/recall remain unmeasured; got/click/pytest were neither replayed nor edited.

See [method.md](method.md) for reproduction and the original causal diagnosis. Recommended next decision: change the positive-collection strategy or source mix, not relax the direct-reuse label or fit a rule to these examples.
`;
  writeFileSync(path.join(evidenceDir, 'report.md'), text);
  const url = (r: Observation, s: Ref) => `${manifest.repos.find((p) => p.id === r.repo)!.url.replace(/\.git$/, '')}/blob/${s.revision}/${s.file}#L${s.line}-L${s.endLine}`;
  writeFileSync(path.join(evidenceDir, 'pairs.md'), ['# Complete action-labelled development pairs', '', 'Agent-reviewed, not human-approved. Unknown cases are withheld, never positive or negative supervision.', '',
    '| Pair / family | Action | Exact before sites | Reason |', '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.id}<br>${r.review.family} | ${r.review.actionClass} | [${r.a.symbol}](${url(r, r.a)}) → [${r.b.symbol}](${url(r, r.b)}) | ${r.review.reason.replace(/\|/g, '\\|')} |`), ''].join('\n'));
  console.log(`Action diagnosis: ${summary.searchedCommits} commits; ${positives} positive families (${tsFamilies} TS, ${total['direct-reuse']} direct), ${total['related-different']} related-different, ${total.unknown} unknown. Targets not met; no detector changes.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) renderActions();

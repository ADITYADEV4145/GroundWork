import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auc } from './real-history-diagnose.js';
import { digest, evidenceDir, type Ref } from './real-history-dev.js';
import manifest from '../bench/real-history/dev/repos.json' with { type: 'json' };

export interface Observation {
  id: string; repo: string; commit: string; origin: string; a: Ref; b: Ref;
  review: { label: 'positive' | 'negative' | 'unknown'; actionClass: import('./real-history-diagnose.js').ActionClass; family: string; mode: string; reason: string; reviewer: string };
  current: { signals: Record<string, number>; probability: number; pairWouldBlock: boolean; related: boolean; compatible: boolean };
  features: Record<string, number | null>;
}
export function separation<T extends { review: { label: 'positive' | 'negative' | 'unknown'; family: string } }>(rows: T[], field: (r: T) => number | null | undefined, direction = 1) {
  const groups = new Map<string, number>();
  const available = rows.flatMap((row) => {
    const value = field(row);
    if (value === null || value === undefined) return [];
    if (!Number.isFinite(value)) throw new Error('Nonfinite feature');
    const group = `${row.review.label}:${row.review.family}`;
    groups.set(group, (groups.get(group) ?? 0) + 1);
    return [{ row, value, group }];
  });
  const side = (label: string) => available.filter((r) => r.row.review.label === label);
  const mean = (xs: typeof available) => xs.length ? xs.reduce((n, r) => n + r.value, 0) / xs.length : null;
  const p = side('positive'), n = side('negative');
  const data = (xs: typeof available, weighted: boolean) => xs.map((r) => ({ value: direction * r.value, weight: weighted ? 1 / groups.get(r.group)! : 1 }));
  return { positiveMean: mean(p), negativeMean: mean(n), positiveAvailable: p.length, negativeAvailable: n.length,
    auc: auc(data(p, false), data(n, false)), familyAuc: auc(data(p, true), data(n, true)), direction };
}

const load = <T>(file: string): T => JSON.parse(readFileSync(path.join(evidenceDir, file), 'utf8')) as T;
const fmt = (v: number | null) => v === null ? '—' : v.toFixed(3);
const contractFeatures = ['reads', 'writes', 'calls', 'returnShape', 'arity', 'parameterUse', 'exceptions', 'validation', 'earlyReturns', 'sameFile', 'verbOpposition', 'writePresenceMismatch', 'literals'];

export function render() {
  if (manifest.repos.length > 5) throw new Error('Use scripts/render-real-history-actions.ts for expanded action-class evidence.');
  const rows = manifest.repos.flatMap((r) => load<Observation[]>(`${r.id}-features.json`));
  const labels = load<{ id: string }[]>('labels.json');
  if (new Set(rows.map((r) => r.id)).size !== rows.length || rows.length !== labels.length || labels.some((l) => !rows.some((r) => r.id === l.id))) throw new Error('Features do not exactly cover labels');
  const positive = rows.filter((r) => r.review.label === 'positive'), negative = rows.filter((r) => r.review.label === 'negative');
  const callable = rows.filter((r) => !r.current.related && r.current.compatible);
  const signals = Object.keys(rows[0]?.current.signals ?? {}).map((feature) => ({ feature, ...separation(rows, (r) => r.current.signals[feature]) }));
  const contracts = contractFeatures.map((feature) => ({ feature, ...separation(callable, (r) => r.features[feature], ['verbOpposition', 'writePresenceMismatch'].includes(feature) ? -1 : 1) }));
  const repos = manifest.repos.map((repo) => {
    const mine = load<{ commits: { productionFiles: string[] }[]; proposals: unknown[] }>(`${repo.id}-mining.json`);
    const replay = load<{ runs: { ms: number; report: { status: string; findings: { kind: string; severity: string }[] } }[] }>(`${repo.id}-normal.json`);
    const findings = replay.runs.flatMap((r) => r.report.findings).filter((f) => f.kind === 'duplicate');
    const selected = rows.filter((r) => r.repo === repo.id);
    return { ...repo, commitsMined: mine.commits.length, commitsWithProductionChanges: mine.commits.filter((c) => c.productionFiles.length).length, rawProposals: mine.proposals.length,
      sampledNormalCommits: replay.runs.length, unavailable: replay.runs.filter((r) => r.report.status === 'UNAVAILABLE').length,
      legacyBlock: findings.filter((f) => f.severity === 'BLOCK').length, legacyWarn: findings.filter((f) => f.severity === 'WARN').length,
      seconds: replay.runs.reduce((n, r) => n + r.ms / 1000, 0), positive: selected.filter((r) => r.review.label === 'positive').length, negative: selected.filter((r) => r.review.label === 'negative').length };
  });
  const pairs = { positive: positive.length, negative: negative.length, positiveFamilies: new Set(positive.map((r) => r.review.family)).size,
    negativeFamilies: new Set(negative.map((r) => r.review.family)).size, positivePairScoresAboveBlock: positive.filter((r) => r.current.pairWouldBlock).length,
    negativePairScoresAboveBlock: negative.filter((r) => r.current.pairWouldBlock).length, testPositive: positive.filter((r) => r.origin === 'refactor-test').length };
  const summary = { protocol: 'Development case-control diagnosis; no detector/model changes or held-out evaluation. Agent-reviewed, not human-approved.',
    signalDetector: manifest.signalDetector, sourceHashes: Object.fromEntries(['src/reuse/model.json', 'src/reuse/signals.ts', 'src/reuse/policy.ts', 'scripts/real-history-features.ts', 'bench/real-history/dev/labels.json'].map((f) => [f, digest(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))])),
    pairs, repos, signals, contracts, independentCallablePairs: callable.length,
    allPairContractStats: contractFeatures.map((feature) => ({ feature, ...separation(rows, (r) => r.features[feature], ['verbOpposition', 'writePresenceMismatch'].includes(feature) ? -1 : 1) })) };
  writeFileSync(path.join(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const table = (metrics: typeof signals) => [
    '| Feature | Positive mean (available) | Negative mean (available) | AUC | Family-balanced AUC |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...metrics.map((r) => `| ${r.feature}${r.direction < 0 ? ' ↓' : ''} | ${fmt(r.positiveMean)} (${r.positiveAvailable}) | ${fmt(r.negativeMean)} (${r.negativeAvailable}) | ${fmt(r.auc)} | ${fmt(r.familyAuc)} |`),
  ].join('\n');
  const text = `# Real-history development evidence and diagnosis

**Step 1 only. No detector, threshold, model or final-evaluation evidence changed. Labels are agent-reviewed, not human-approved. This is not a held-out precision result or a passing acceptance gate.**

## Repositories, pins and windows

All windows are **2025-01-01 00:00:00 UTC through 2025-07-01 00:00:00 UTC (exclusive)**. Start pins are exclusive; end pins inclusive. Calendar membership uses committer timestamps and reachable non-merge history. URLs, licenses and full pins are in [repos.json](repos.json). Source clones/worktrees live outside GroundWork (default \`~/work/gw-real-history\`, override \`GW_REAL_HISTORY_CACHE\`). No upstream source is vendored here.

| Repo / license | Start | End | Non-merges mined (production-changing) |
| --- | --- | --- | ---: |
${repos.map((r) => `| [${r.id}](${r.url}) / ${r.license} | \`${r.start}\` | \`${r.end}\` | ${r.commitsMined} (${r.commitsWithProductionChanges}) |`).join('\n')}

## Mining and strict review

The production scan covers **${repos.reduce((n, r) => n + r.commitsMined, 0)} non-merge commits**, producing ${repos.reduce((n, r) => n + r.rawProposals, 0)} **unreviewed proposals**, not positives. It uses shortened bodies now calling an existing function, removed bodies with an existing call added, and two shortened bodies now using one new helper. Keywords guide inspection; they are not labels. Supplementary test mining uses refactor/parameterize/cleanup keywords. The miner uses names, not resolved bindings, so a same-spelled call is only a proposal. Pure relocations are excluded; constructors and common builtins are not guessed across unrelated classes. Raw audits and proposals remain in \`*-mining.json\`.

Reviewed positives are **${pairs.positive} pre-refactor pairs in ${pairs.positiveFamilies} author-refactor families**, with both original bodies and the actual refactoring diff inspected. [positive-groups.json](positive-groups.json) documents the proof and action for each family; [positive-pairs.json](positive-pairs.json) stores exact parent revisions, locations, SHA-256 body hashes and post-refactor helper references.

- **21 pairs from seven scikit-learn backend predicates are ONE family**, not 21 independent events. This code is vendored upstream from array-api-compat, whose pinned \`sklearn/externals/array_api_compat/LICENSE\` is **MIT** (the enclosing repository is BSD-3-Clause).
- Django contributes mail-recipient helper extraction and expression-resolution consolidation, plus **one test-only assertion consolidation**. Only **23 positive pairs / 3 families** are in production paths. There are **no TS positive families** in this reviewed slice.
- **None of these 24 labels establishes safe unchanged direct-call replacement.** They prove helper extraction or extension; recipient/backend differences and missing validation must be preserved. Treating them as direct-call equivalence would recreate the detector's semantic error.
- All backend pair combinations are expanded explicitly, so family-balanced statistics are mandatory. This is enough to expose failure modes, **not enough independent positive supervision to fit or validate a BLOCK model**. Further independent TS and direct-reuse positives are needed before training.

Negatives come from built **pre-#8 permissive detector \`${manifest.permissiveDetector}\`** BLOCK/WARN pairs on normal commits, not synthetic mutations. Normal commits exclude the mining keywords and require a production-path change. Sampling is deterministic: smallest SHA-256(\`normal-v1:<commit>\`), up to 12 per repo and 4 for Django/scikit-learn. The cost-based cap limits replay time. The built \`checkRepository\` API runs at each commit against its parent with a 120 s core timeout; no detector decisions were modified.

| Repo | Sampled commits | Unavailable | Permissive duplicate BLOCK / WARN | Replay seconds | Reviewed positive / negative pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
${repos.map((r) => `| ${r.id} | ${r.sampledNormalCommits} | ${r.unavailable} | ${r.legacyBlock} / ${r.legacyWarn} | ${r.seconds.toFixed(2)} | ${r.positive} / ${r.negative} |`).join('\n')}

**Three Django runs timed out** (\`reuse check timed out\`); these are unavailable, never clean negatives. Across all repos there are 118 duplicate pairs in available runs. One duplicate-file WARN and two grounding BLOCKs are outside function-pair review. **${pairs.negative} of the 118 pairs were purposefully reviewed**: eight obvious containment errors plus short-body semantic counterexamples, generated/version-boundary cases, caller/callee stages and lifecycle opposition. Two high-structure Zod counterexamples supplement that short-body slice. Selection is intentionally diagnostic, **not representative**; the remaining 85 normal pairs and raw positive proposals are unlabelled. Do not treat them as negatives or infer population precision. [negative-reviews.json](negative-reviews.json) records every selected negative's reasoning; [pairs.md](pairs.md) is the complete labelled table with source links.

## Current signals (frozen baseline)

Every labelled pair has the current default \`pairSignals\`, binding-aware source extraction, model probability and BLOCK eligibility in \`*-features.json\`. IDF is rebuilt using **all indexed symbols at the exact pair revision**, as in CandidateIndex, not a unit/dev-pair approximation. Optional meaning is absent; no model was downloaded or changed for this diagnosis.

${table(signals)}

On these selected pairs, **${pairs.positivePairScoresAboveBlock}/${pairs.positive} positives** pass the frozen score + policy and **${pairs.negativePairScoresAboveBlock}/${pairs.negative} negatives** do. Positive pair-scoring sensitivity is **${(100 * pairs.positivePairScoresAboveBlock / pairs.positive).toFixed(1)}%**, **not end-to-end recall**: candidate retrieval, best-match competition, test exclusion and changed-symbol selection have not been replayed for the positive reference set. Nor is this a BLOCK precision estimate: case-control prevalence is artificial and positive helper-extraction labels do not validate a direct-call fix. Overall real-history recall is not estimable without reviewing missed opportunities in a defined history population.

## Proposed contract/side-effect separation

These are **dev-only syntactic prototypes**, not runtime features. Main contract statistics use the **${callable.length} independent compatible callable pairs** (24 positive, 25 negative), excluding the eight containment artifacts that current policy already rejects. All-pair statistics are retained in [summary.json](summary.json).

Higher similarity is oriented positive; ↓ means lower mismatch/opposition is oriented positive. AUC is the probability that a randomly selected observed positive outranks an observed negative (ties half); 0.5 means no rank separation. Family-balanced AUC gives each label/family equal weight **among observed values of that feature**, preventing 21 backend comparisons from dominating. No direction or cutoff was optimized. Means are unweighted. Empty unions, unknown return shapes, unavailable contracts and undefined usage/early-return ratios are **missing**, not a fabricated match; the table gives coverage.

${table(contracts)}

- **Reads/writes:** member paths preserve SELF and parameter-position roles and literal subscript keys; known mutating member calls overapproximate writes. Local copies are not distinguished from observable state and aliases are unresolved. A global \`set(...)\` constructor is not a mutation. Compound writes are also reads.
- **Calls:** normalized syntactic callee sets, not resolved call targets. Imports, overloads and dynamic dispatch remain unverified.
- **Returns:** known literal/object-key/tuple/construction shapes only; an arbitrary returned local has unknown shape. A \`call\` return kind is weak evidence, not equal runtime type. Boolean comparisons are recognized; Python \`a or b\` is not assumed boolean.
- **Parameters:** arity excludes self/cls; usage cosine aligns positional roles, with destructuring/alias limitations.
- **Exceptions/validation/early returns:** explicit raises/throws and conditional exits only, excluding nested declarations. No inferred callee exceptions, full CFG or effect analysis.
- **Same-file and verb opposition:** simple location/verb features. All positive families were mined within one file, so same-file separation is confounded; opposition has little support, not a validated gate.
- **Literals:** SHA-256 sets of literal spellings excluding docstrings. This preserves value differences hidden by coarse STR/NUM fingerprints without copying upstream messages. Escaping and templates are syntactic, not evaluated. The datetime counterexample differs in required offset minutes despite identical normalized structure; backend/recipient positives also deliberately differ in literals, so a blanket literal-equality veto would reject valid helper extraction.

## Diagnosis and recommended model design

See [method.md](method.md) for causal evidence, rejected mining shortcuts, the proposed action-aware architecture, limitations and exact reproduction commands. **Do not train a new BLOCK classifier from these four positive families.** Keep runtime policy/models frozen, enlarge independent positive supervision (especially TS and safe direct reuse), then fit/evaluate by family/repo, not random pair splits. Reserve got/click/pytest and their final windows until after code freeze. This handoff neither replays nor edits that evidence, and does not claim the ≥90% / ≥20 held-out BLOCK goal has been met.
`;
  writeFileSync(path.join(evidenceDir, 'report.md'), text);
  const url = (r: Observation, s: Ref) => `${manifest.repos.find((p) => p.id === r.repo)!.url.replace(/\.git$/, '')}/blob/${s.revision}/${s.file}#L${s.line}-L${s.endLine}`;
  const cells = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const review = ['# Complete labelled development pairs', '', 'Agent-reviewed, not human-approved. Positive means author-performed helper extraction/consolidation, not necessarily direct-call equivalence. Each site links its exact revision; SHA-256 body hashes are in the JSON artifacts.', '',
    '| ID / family | Label / mode | Before sites | Author refactor or normal commit | Reason |', '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.id}<br>${r.review.family} | ${r.review.label}<br>${r.review.mode} | [${cells(r.a.symbol)}](${url(r, r.a)}) → [${cells(r.b.symbol)}](${url(r, r.b)}) | \`${r.commit}\` | ${cells(r.review.reason)} |`), ''].join('\n');
  writeFileSync(path.join(evidenceDir, 'pairs.md'), review);
  console.log(`Development diagnosis: ${pairs.positive} positive pairs (${pairs.positiveFamilies} families), ${pairs.negative} negative pairs; ${signals.length} current signals and ${contracts.length} proposed features measured. No held-out evaluation.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) render();

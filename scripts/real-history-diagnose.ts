import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initParsers } from '../src/lang/parser.js';
import { languageForPath } from '../src/lang/index.js';
import { extractReuseSource } from '../src/reuse/source.js';
import { buildIdf, pairSignals } from '../src/reuse/signals.js';
import { scoreSignals } from '../src/reuse/model.js';
import { canBlock, compatibleKinds, relatedSymbols } from '../src/reuse/policy.js';
import { readFingerprintedSymbols } from '../src/index/query.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { cacheDir, evidenceDir, git, digest, type Ref } from './real-history-dev.js';
import { contractOf, compareContracts } from './real-history-features.js';
import manifest from '../bench/real-history/dev/repos.json' with { type: 'json' };

type Label = { id: string; label: 'positive' | 'negative'; mode: string; family: string; reason: string; reviewer: 'agent-reviewed' };
type Pair = { id: string; repo: string; commit: string; origin: string; a: Ref; b: Ref; after?: Ref[]; legacy?: { severity: string; probability: number }; subject?: string; identity?: { related: boolean; compatible: boolean } };
const load = <T>(name: string): T => JSON.parse(readFileSync(path.join(evidenceDir, name), 'utf8')) as T;
const save = (name: string, value: unknown) => writeFileSync(path.join(evidenceDir, name), JSON.stringify(value, null, 2) + '\n');

const sourceCache = new Map<string, { text: string; extracted: ReturnType<typeof extractReuseSource>; language: NonNullable<ReturnType<typeof languageForPath>> }>();
function source(repo: string, revision: string, file: string) {
  const key = `${repo}:${revision}:${file}`;
  if (!sourceCache.has(key)) {
    const text = git(path.join(cacheDir, repo), 'show', `${revision}:${file}`), language = languageForPath(file);
    if (!language) throw new Error(`Unsupported source: ${file}`);
    sourceCache.set(key, { text, extracted: extractReuseSource(text, language), language });
  }
  return sourceCache.get(key)!;
}
function resolve(repo: string, ref: Pick<Ref, 'revision' | 'file' | 'symbol' | 'line'> & Partial<Ref>) {
  const file = source(repo, ref.revision, ref.file);
  const found = file.extracted.symbols.filter((s) => s.qualifiedName === ref.symbol && s.startLine === ref.line);
  if (found.length !== 1) throw new Error(`Expected one symbol: ${repo} ${JSON.stringify(ref)}, found ${found.length}`);
  const symbol = found[0]!, sha256 = digest(file.text.slice(symbol.startByte, symbol.endByte));
  if (ref.sha256 && ref.sha256 !== sha256) throw new Error(`Stale source hash: ${ref.symbol}`);
  return { ...file, symbol: { ...symbol, file: ref.file }, ref: { revision: ref.revision, file: ref.file, symbol: ref.symbol, line: ref.line,
    endLine: file.text.slice(0, symbol.endByte).split('\n').length, kind: symbol.kind, sha256 } satisfies Ref };
}

async function catalog() {
  await initParsers();
  const pairs: Pair[] = [];
  for (const repo of manifest.repos) {
    const input = load<{ runs: { hash: string; subject: string; report: { status: string; findings: { kind: string; severity: string; probability: number; added: { file: string; symbol: string; line: number }; existing: { file: string; symbol: string; line: number } }[] } }[] }>(`${repo.id}-normal.json`);
    for (const run of input.runs) {
      if (run.report.status === 'UNAVAILABLE') continue;
      for (const [i, finding] of run.report.findings.entries()) {
        if (finding.kind !== 'duplicate') continue;
        const a = resolve(repo.id, { ...finding.added, revision: run.hash }), b = resolve(repo.id, { ...finding.existing, revision: run.hash });
        pairs.push({ id: `${repo.id}-normal-${run.hash.slice(0, 10)}-${i}`, repo: repo.id, commit: run.hash, subject: run.subject, origin: 'permissive-normal',
          a: a.ref, b: b.ref, legacy: { severity: finding.severity, probability: finding.probability } });
        pairs.at(-1)!.identity = { related: relatedSymbols(a.symbol, b.symbol), compatible: compatibleKinds(a.symbol, b.symbol) };
      }
    }
  }
  save('normal-pairs.json', pairs);
  console.log(`Catalog: ${pairs.length} permissive normal-commit pairs, exact source hashes verified`);
}

async function positives() {
  await initParsers();
  const groups = load<{ id: string; repo: string; commit: string; file: string; members: string[]; afterHelper: string; mode: string; reason: string }[]>('positive-groups.json');
  const pairs: Pair[] = [], labels: Label[] = [];
  for (const group of groups) {
    const repo = path.join(cacheDir, group.repo), before = git(repo, 'rev-parse', `${group.commit}^`).trim();
    const site = (revision: string, name: string) => {
      const symbols = source(group.repo, revision, group.file).extracted.symbols.filter((s) => s.qualifiedName === name);
      if (symbols.length !== 1) throw new Error(`Ambiguous positive symbol ${name}`);
      return resolve(group.repo, { revision, file: group.file, symbol: name, line: symbols[0]!.startLine }).ref;
    };
    for (let i = 0; i < group.members.length; i++) for (let j = i + 1; j < group.members.length; j++) {
      const a = site(before, group.members[i]!), b = site(before, group.members[j]!);
      const id = `${group.id}-${digest(`${a.symbol}:${b.symbol}`).slice(0, 10)}`;
      pairs.push({ id, repo: group.repo, commit: group.commit, origin: group.file.startsWith('tests/') ? 'refactor-test' : 'refactor-production', a, b, after: [site(group.commit, group.afterHelper)] });
      labels.push({ id, label: 'positive', mode: group.mode, family: group.id, reason: `${a.symbol} / ${b.symbol}: ${group.reason}`, reviewer: 'agent-reviewed' });
    }
  }
  save('positive-pairs.json', pairs); save('positive-labels.json', labels);
  console.log(`Positive seeds: ${pairs.length} pairs, ${groups.length} author-refactor families; none labeled direct-call interchangeable`);
}

function labels() {
  const pairs = load<Pair[]>('normal-pairs.json');
  const negatives = load<{ id: string; reason: string }[]>('negative-reviews.json').map((r): Label => {
    const pair = pairs.find((p) => p.id === r.id);
    if (!pair) throw new Error(`Missing normal finding ${r.id}`);
    return { ...r, label: 'negative', mode: pair.identity?.related ? 'containment' : 'different-contract', family: `${pair.repo}:${pair.commit}`, reviewer: 'agent-reviewed' };
  });
  const output = [...load<Label[]>('positive-labels.json'), ...negatives];
  if (new Set(output.map((r) => r.id)).size !== output.length) throw new Error('Duplicate labels');
  save('labels.json', output);
  console.log(`Labels: ${output.length - negatives.length} positive, ${negatives.length} negative; agent-reviewed, not human-approved`);
}

export function auc(positive: { value: number; weight: number }[], negative: { value: number; weight: number }[]): number | null {
  const denominator = positive.reduce((n, x) => n + x.weight, 0) * negative.reduce((n, x) => n + x.weight, 0);
  return denominator ? positive.reduce((n, p) => n + negative.reduce((m, q) => m + p.weight * q.weight * (p.value > q.value ? 1 : p.value === q.value ? 0.5 : 0), 0), 0) / denominator : null;
}

async function diagnose(repoId: string) {
  await initParsers(); await initSqlBackend();
  const labels = load<Label[]>('labels.json');
  const normal = load<Pair[]>('normal-pairs.json');
  const proposals = load<Pair[]>('positive-pairs.json');
  const catalog = new Map([...normal, ...proposals].map((p) => [p.id, p]));
  const selected = labels.filter((l) => catalog.get(l.id)?.repo === repoId).map((l) => ({ pair: catalog.get(l.id)!, label: l }));
  if (!selected.length) { save(`${repoId}-features.json`, []); return; }
  const clone = path.join(cacheDir, repoId), worktree = path.join(cacheDir, `${repoId}-features`);
  if (!existsSync(worktree)) git(clone, 'worktree', 'add', '--detach', worktree, selected[0]!.pair.a.revision);
  const output = [];
  const groups = new Map<string, typeof selected>();
  for (const item of selected) {
    if (item.pair.a.revision !== item.pair.b.revision) throw new Error('Both before sites must exist simultaneously.');
    const revision = item.pair.a.revision;
    groups.set(revision, [...(groups.get(revision) ?? []), item]);
  }
  for (const [revision, items] of groups) {
    git(worktree, 'switch', '--detach', revision);
    await refreshIndex(worktree);
    const db = openDb(indexDbPath(worktree), { readonly: true });
    let idf: ReturnType<typeof buildIdf>;
    try { idf = buildIdf(readFingerprintedSymbols(db)); }
    finally { db.close(); }
    for (const { pair, label } of items) {
      const a = resolve(repoId, pair.a), b = resolve(repoId, pair.b);
      const signals = pairSignals(a.symbol, b.symbol, idf), score = scoreSignals(signals);
      const left = contractOf(a.text, a.language, a.symbol), right = contractOf(b.text, b.language, b.symbol);
      output.push({ ...pair, review: label, current: { signals, probability: score.probability, thresholds: score.thresholds,
        related: relatedSymbols(a.symbol, b.symbol), compatible: compatibleKinds(a.symbol, b.symbol), blockEligible: canBlock(a.symbol, b.symbol, signals),
        pairWouldBlock: score.probability >= score.thresholds.block && canBlock(a.symbol, b.symbol, signals), idf: 'all indexed symbols at the exact before/current revision; same buildIdf population as CandidateIndex' },
      contracts: { a: left, b: right }, features: compareContracts(left, right, { aName: a.symbol.name, bName: b.symbol.name, sameFile: pair.a.file === pair.b.file }) });
    }
    save(`${repoId}-features.json`, output);
    console.log(`${repoId}: ${output.length}/${selected.length} pairs, ${revision.slice(0, 10)}`);
    sourceCache.clear();
  }
}

async function contracts() {
  await initParsers();
  const reviews = new Map(load<Label[]>('labels.json').map((r) => [r.id, r]));
  for (const repo of manifest.repos) {
    const rows = load<(Pair & { review: Label; contracts: { a: ReturnType<typeof contractOf>; b: ReturnType<typeof contractOf> }; features: ReturnType<typeof compareContracts> })[]>(`${repo.id}-features.json`);
    for (const row of rows) {
      const a = resolve(repo.id, row.a), b = resolve(repo.id, row.b);
      row.review = reviews.get(row.id)!;
      row.contracts = { a: contractOf(a.text, a.language, a.symbol), b: contractOf(b.text, b.language, b.symbol) };
      row.features = compareContracts(row.contracts.a, row.contracts.b, { aName: a.symbol.name, bName: b.symbol.name, sameFile: row.a.file === row.b.file });
    }
    save(`${repo.id}-features.json`, rows); sourceCache.clear();
    console.log(`${repo.id}: ${rows.length} exploratory contracts refreshed; exact source hashes verified`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , command, repo] = process.argv;
  if (command === 'catalog') await catalog();
  else if (command === 'positives') await positives();
  else if (command === 'labels') labels();
  else if (command === 'contracts') await contracts();
  else if (command === 'features' && manifest.repos.some((r) => r.id === repo)) await diagnose(repo!);
  else throw new Error('Usage: node --import tsx scripts/real-history-diagnose.ts catalog|positives|labels|contracts|features [repo]');
}

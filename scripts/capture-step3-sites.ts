import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initParsers, languageForPath } from '../src/lang/index.js';
import { extractReuseSource } from '../src/reuse/source.js';
import { cache, git, project } from './real-repos.js';
import type { CheckFinding, CheckLocation } from '../src/reuse/check.js';
import { cacheDir } from './real-history-dev.js';

const directory = path.join(project, 'bench/real-repos');
const intros = process.argv.includes('--intro-only');
const sets = intros ? [] : ['original', 'heldout', 'new-1', 'new-2'];
type Row = { set: string; repo: string; commit: string; committedAt: string; finding: CheckFinding };
const rows: Row[] = [];
for (const set of sets) for (const repo of ['got', 'click', 'pytest']) {
  const data = JSON.parse(readFileSync(path.join(directory, 'step3', set, 'runs', `${repo}.json`), 'utf8'));
  if (data.runs.length !== data.selectedCommits.length) throw new Error('Replay still incomplete');
  for (const run of data.runs) for (const finding of run.findings) rows.push({ set, repo, commit: run.commit, committedAt: run.committedAt, finding });
}
const selected = rows.filter((r) => r.finding.severity === 'BLOCK');
if (intros) {
  const data = JSON.parse(readFileSync(path.join(project, 'bench/real-history/introduction-recall.json'), 'utf8'));
  const seen = new Set<string>();
  for (const row of data.rows) for (const finding of row.replay?.findings ?? []) {
    const key = `${row.repo}:${row.introduction}:${finding.id}`;
    if (finding.severity !== 'BLOCK' || seen.has(key)) continue;
    seen.add(key); selected.push({ set: 'dev-introduction', repo: row.repo, commit: row.introduction, committedAt: '', finding });
  }
}
for (const repo of ['got', 'click', 'pytest']) {
  const warnings = rows.filter((r) => r.repo === repo && r.finding.severity === 'WARN').sort((a, b) => Date.parse(a.committedAt) - Date.parse(b.committedAt) || a.commit.localeCompare(b.commit) || a.finding.id.localeCompare(b.finding.id));
  const count = Math.min(10, warnings.length);
  for (let i = 0; i < count; i++) selected.push(warnings[Math.floor(i * (warnings.length - 1) / Math.max(1, count - 1))]!);
}
await initParsers();
const locate = (row: Row, loc: CheckLocation | null) => {
  if (!loc) return null;
  const source = git(path.join(intros ? cacheDir : cache, row.repo), 'show', `${row.commit}:${loc.file}`);
  const language = languageForPath(loc.file);
  const symbols = language ? extractReuseSource(source, language).symbols : [];
  const symbol = symbols.find((s) => s.qualifiedName === loc.symbol && s.startLine === loc.line) ?? symbols.find((s) => s.qualifiedName === loc.symbol && s.startLine <= loc.line && s.endLine >= loc.line);
  const body = symbol ? source.slice(symbol.startByte, symbol.endByte) : source.split('\n').slice(Math.max(0, loc.line - 3), loc.line + 35).join('\n');
  return { ...loc, endLine: symbol?.endLine ?? loc.line + 35, sha256: createHash('sha256').update(body).digest('hex'), body };
};
writeFileSync(path.join(cache, intros ? 'step3-intro-review-sites.json' : 'step3-review-sites.json'), JSON.stringify(selected.map((r) => ({ ...r, added: locate(r, r.finding.added), existing: locate(r, r.finding.existing) })), null, 2) + '\n');
console.log(`Selected ${selected.length} sites (${selected.filter((r) => r.finding.severity === 'BLOCK').length} BLOCKs); raw upstream source remains in external cache.`);

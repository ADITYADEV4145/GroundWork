import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterFor, initParsers, languageForPath } from '../src/lang/index.js';
import { extractReuseSource } from '../src/reuse/source.js';
import { cacheDir, evidenceDir, git, digest, type Ref } from './real-history-dev.js';
import type { CheckFinding } from '../src/reuse/check.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const families = JSON.parse(readFileSync(path.join(evidenceDir, 'families.json'), 'utf8')) as { id: string; repo: string; representative: string; actionClass: string }[];
const manifest = JSON.parse(readFileSync(path.join(evidenceDir, 'repos.json'), 'utf8')) as { repos: { id: string }[] };
const rows = manifest.repos.flatMap((r) => JSON.parse(readFileSync(path.join(evidenceDir, `${r.id}-features.json`), 'utf8')) as { id: string; a: Ref; b: Ref }[]);
await initParsers();
const locate = (repo: string, revision: string, ref: Ref) => {
  let source: string;
  try { source = execFileSync('git', ['-C', repo, 'show', `${revision}:${ref.file}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; }
  const extraction = extractReuseSource(source, languageForPath(ref.file)!);
  if (extraction.hasErrors) return null;
  const symbols = extraction.symbols.filter((s) => s.qualifiedName === ref.symbol);
  if (symbols.length !== 1) return null;
  const s = symbols[0]!;
  return { ref: { ...ref, revision, line: s.startLine, endLine: s.endLine, sha256: digest(source.slice(s.startByte, s.endByte)) }, bindingHash: s.bindingHash };
};
const output: object[] = [];
if (process.argv.includes('--audit-parents')) {
  const file = path.join(root, 'bench/real-history/introduction-recall.json');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  for (const row of data.rows.filter((r: { identityBirth: boolean }) => r.identityBirth)) {
    const repo = path.join(cacheDir, row.repo);
    row.parentPresence = ['a', 'b'].map((key) => {
      const ref = row[key].ref as Ref;
      if (spawnSync('git', ['-C', repo, 'cat-file', '-e', `${row.parent}:${ref.file}`]).status !== 0) return { file: ref.file, fileAbsent: true, count: 0, hasErrors: false };
      const source = git(repo, 'show', `${row.parent}:${ref.file}`), extraction = adapterFor(languageForPath(ref.file)!).extract(source, languageForPath(ref.file)!);
      return { file: ref.file, fileAbsent: false, count: extraction.symbols.filter((s) => s.qualifiedName === ref.symbol).length, hasErrors: extraction.hasErrors };
    });
    if (row.parentPresence.some((p: { hasErrors: boolean }) => p.hasErrors) || !row.parentPresence.some((p: { count: number }) => p.count === 0)) throw new Error(`${row.family}: birth was not verifiable against parsed parent`);
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log('Introduction parent-presence/parse audit: PASS');
  process.exit(0);
}
const save = () => writeFileSync(path.join(root, 'bench/real-history/introduction-recall.json'), JSON.stringify({ method: 'Definition-origin blame candidates with both symbols checked at candidate and parent. No candidate is a verified duplicate introduction without source review. Only verified source-reviewed births with available end-to-end replay enter recall. Initial cold runs and warm-index retries are retained as separate attempts; unavailable runs are never false negatives.', rows: output }, null, 2) + '\n');
const previous = process.argv.includes('--retry-unavailable') || process.argv.includes('--recover-missing') ? JSON.parse(readFileSync(path.join(root, 'bench/real-history/introduction-recall.json'), 'utf8')).rows : [];
for (const family of families.filter((f) => f.actionClass === 'extract/extend')) {
  const prior = previous.find((r: { family: string }) => r.family === family.id);
  if (prior && (process.argv.includes('--recover-missing') || prior.replay?.status !== 'UNAVAILABLE')) { output.push(prior); save(); continue; }
  const repo = path.join(cacheDir, family.repo), pair = rows.find((r) => r.id === family.representative)!;
  if (git(repo, 'rev-parse', '--is-shallow-repository').trim() !== 'false') throw new Error(`Unshallow ${repo} first.`);
  const candidates = [pair.a, pair.b].map((ref) => {
    const blame = git(repo, 'blame', '--line-porcelain', '-L', `${ref.line},${ref.line}`, ref.revision, '--', ref.file);
    const commit = blame.split(' ')[0]!, file = blame.split('\n').find((s) => s.startsWith('filename '))!.slice(9);
    return { commit, ref: { ...ref, file } };
  });
  let introduction: string | null = null;
  if (candidates[0]!.commit === candidates[1]!.commit) introduction = candidates[0]!.commit;
  else {
    const ancestor = (a: string, b: string) => spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', a, b]).status === 0;
    if (ancestor(candidates[0]!.commit, candidates[1]!.commit)) introduction = candidates[1]!.commit;
    else if (ancestor(candidates[1]!.commit, candidates[0]!.commit)) introduction = candidates[0]!.commit;
  }
  const a = introduction ? locate(repo, introduction, candidates[0]!.ref) : null, b = introduction ? locate(repo, introduction, candidates[1]!.ref) : null;
  const parent = introduction && git(repo, 'rev-parse', `${introduction}^`).trim();
  const previousA = parent && locate(repo, parent, candidates[0]!.ref), previousB = parent && locate(repo, parent, candidates[1]!.ref);
  const identityBirth = !!a && !!b && (!previousA || !previousB);
  const row: Record<string, unknown> = { family: family.id, repo: family.repo, representative: family.representative, candidates,
    introduction, parent, identityBirth, a: a || null, b: b || null, previousA: previousA || null, previousB: previousB || null,
    sameBindingsAsConsolidated: [a && a.bindingHash === locate(repo, pair.a.revision, pair.a)?.bindingHash, b && b.bindingHash === locate(repo, pair.b.revision, pair.b)?.bindingHash],
    limitation: identityBirth ? 'Observed pair identities first coexist at this definition-origin candidate; inspect the initial implementations before calling this duplicate introduction.' : 'Definition-line blame is not a verified introduction: a pair site is missing or both names already existed in the parent. Do not count as a recall denominator.' };
  if ((process.argv.includes('--replay') || process.argv.includes('--retry-unavailable') || process.argv.includes('--recover-missing')) && identityBirth) {
    const tree = path.join(cacheDir, `intro-${family.id}`);
    if (!existsSync(tree)) git(repo, 'worktree', 'add', '--detach', tree, introduction!);
    if (git(tree, 'rev-parse', 'HEAD').trim() !== introduction) throw new Error('Unexpected introduction worktree HEAD');
    const start = performance.now();
    const run = spawnSync(process.execPath, [path.join(root, 'dist/cli/main.js'), 'check', '--base', parent!, '--json'], { cwd: tree, encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
    let result: { status: string; findings: CheckFinding[]; error?: string };
    try { result = JSON.parse(run.stdout); } catch { result = { status: 'UNAVAILABLE', findings: [], error: run.error?.message ?? 'Invalid JSON' }; }
    const refs = [a!.ref, b!.ref];
    const isSite = (site: { file: string; symbol?: string } | null, ref: Ref) => !!site && site.file === ref.file && site.symbol === ref.symbol;
    row.replay = { toolCommit: git(root, 'rev-parse', 'HEAD').trim(), durationMs: performance.now() - start, exitCode: run.status,
      ...result, familyBlocked: result.findings.some((f) => f.severity === 'BLOCK' && ((isSite(f.added, refs[0]!) && isSite(f.existing, refs[1]!)) || (isSite(f.added, refs[1]!) && isSite(f.existing, refs[0]!)))) };
    row.attempts = [...(prior?.attempts ?? (prior?.replay ? [prior.replay] : [])), row.replay];
  }
  output.push(row);
  console.log(`${family.id}: identityBirth=${identityBirth}; candidate ${introduction}; same bindings ${JSON.stringify(row.sameBindingsAsConsolidated)}`);
  save();
}

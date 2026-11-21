import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cache, clonePath, git, monthCommits, project, repositories, sampleCommits, treePath } from './real-repos.js';
import type { CheckFinding } from '../src/reuse/check.js';

const main = path.join(project, 'dist/cli/main.js');
if (!existsSync(main)) throw new Error('Run npm run build first.');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
const only = process.argv.find((arg) => arg.startsWith('--repo='))?.split('=')[1];
if (only && !repositories.some((r) => r.id === only)) throw new Error(`Unknown repository: ${only}`);
const toolCommit = git(project, 'rev-parse', 'HEAD');
const modelHash = createHash('sha256').update(readFileSync(path.join(project, 'src/reuse/model.json'))).digest('hex');
const directory = path.join(cache, 'results');
mkdirSync(directory, { recursive: true });
for (const repo of repositories.filter((r) => !only || r.id === only)) {
  if (git(clonePath(repo), 'rev-parse', '--is-shallow-repository') !== 'false') throw new Error('Run setup-real-repos.ts to unshallow before replay.');
  const tree = treePath(repo), file = path.join(directory, `${repo.id}.json`);
  if (git(tree, 'status', '--porcelain', '--untracked-files=no')) throw new Error(`${tree}: tracked edits; refusing to replay.`);
  if (existsSync(path.join(tree, '.groundwork/config.json'))) throw new Error(`${tree}: custom config present; replay requires unmodified defaults.`);
  const { eligible, excluded } = monthCommits(repo);
  const selected = sampleCommits(eligible, limit);
  const runs: { commit: string; parent: string; subject: string; committedAt: string; checkoutMs: number; durationMs: number;
    exitCode: number | null; status: string; error?: string; stderr: string; findings: CheckFinding[] }[] = [];
  const output = () => writeFileSync(file, JSON.stringify({ schemaVersion: 1, repository: repo, toolCommit, modelHash,
    node: process.version, meaning: false, config: 'unmodified defaults', eligibleCommits: eligible, excludedOutOfMonth: excluded,
    sampling: limit === undefined ? 'none; all non-merge commits in the UTC calendar window' : `evenly spaced chronological indices including both endpoints, limit ${limit}`,
    selectedCommits: selected, totalMs: runs.reduce((sum, r) => sum + r.durationMs + r.checkoutMs, 0), runs }, null, 2) + '\n');
  for (const commit of selected) {
    const checkout = performance.now();
    git(tree, 'checkout', '--detach', commit);
    const checkoutMs = performance.now() - checkout;
    const parent = git(tree, 'rev-parse', `${commit}^`);
    const start = performance.now();
    const processResult = spawnSync(process.execPath, [main, 'check', '--base', parent, '--json'], {
      cwd: tree, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
    });
    const durationMs = performance.now() - start;
    let result: { status: string; error?: string; findings: CheckFinding[] };
    try { result = JSON.parse(processResult.stdout); }
    catch { result = { status: 'UNAVAILABLE', error: processResult.error?.message ?? 'Invalid/missing JSON', findings: [] }; }
    runs.push({ commit, parent, subject: git(tree, 'show', '-s', '--format=%s', commit),
      committedAt: git(tree, 'show', '-s', '--format=%cI', commit), checkoutMs, durationMs,
      exitCode: processResult.status, status: result.status, ...(result.error ? { error: result.error } : {}),
      stderr: processResult.stderr ?? '', findings: result.findings });
    output();
    console.log(`${repo.id} ${runs.length}/${selected.length} ${commit.slice(0, 10)} ${result.status}: ${result.findings.filter((f) => f.severity === 'BLOCK').length} BLOCK, ${result.findings.filter((f) => f.severity === 'WARN').length} WARN (${runs.at(-1)!.durationMs.toFixed(0)} ms)${result.error ? ` ${result.error}` : ''}`);
  }
  git(tree, 'checkout', '--detach', repo.end);
  console.log(`${repo.id}: saved ${file}`);
}

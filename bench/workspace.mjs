import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { archiveRepository } from './multiturn-reuse/repositories.mjs';

export const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
  { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });

const commit = (root, message) => git(root, '-c', 'user.name=Groundwork benchmark',
  '-c', 'user.email=benchmark@example.invalid', 'commit', '-qm', message);

export function unpackWorkspace(source, revision, repo, root) {
  if (!/^[0-9a-f]{40}$/.test(revision) || !/^[a-z][a-z0-9-]*$/.test(repo)) throw new Error('Expected a pinned repository or fixture');
  mkdirSync(root);
  const ref = repo === 'groundwork' ? revision : `${revision}:fixtures/${repo}`;
  const archive = repo.startsWith('reuse-') ? archiveRepository(repo.slice(6))
    : execFileSync('git', ['archive', ref], { cwd: source, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 });
  execFileSync('tar', ['-xf', '-'], { cwd: root, input: archive, timeout: 30_000 });
  if (repo !== 'groundwork') rmSync(path.join(root, 'expected.json'), { force: true });
  git(root, 'init', '-q', '--template=');
  git(root, 'add', '-A');
  commit(root, 'Pinned task workspace');
}

export function applyPatch(root, patch, previousStep) {
  if (!patch) return;
  execFileSync('git', ['apply', '--index', '-'], { cwd: root, input: patch, timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] });
  if (previousStep) commit(root, 'Benchmark step ' + previousStep);
}

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groundingRepoLocations, prepareGroundingRepos } from '../src/selftest/grounding-repos.js';

export function setupGroundingRepos(project: string): string[] {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
  for (const repo of groundingRepoLocations(project)) {
    const { dir } = repo;
    mkdirSync(dir, { recursive: true });
    if (!existsSync(path.join(dir, '.git'))) {
      git(dir, 'init', '-q');
      git(dir, 'remote', 'add', 'origin', repo.url);
    }
    if (git(dir, 'config', '--get', 'remote.origin.url') !== repo.url) throw new Error(`${dir}: unexpected origin`);
    if (git(dir, 'status', '--porcelain', '--untracked-files=all')) throw new Error(`${dir}: checkout is not clean`);
    try { git(dir, 'cat-file', '-e', `${repo.end}^{commit}`); }
    catch { git(dir, 'fetch', '--depth=1', 'origin', repo.end); }
    git(dir, 'checkout', '--detach', repo.end);
  }
  return prepareGroundingRepos(project);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = fileURLToPath(new URL('../', import.meta.url));
  for (const dir of setupGroundingRepos(project)) console.log(`Prepared pinned grounding repository: ${dir}`);
}

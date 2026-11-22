import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';

export const manifest = JSON.parse(readFileSync(new URL('./repos.json', import.meta.url), 'utf8'));
export const cache = path.resolve(process.env.GW_REUSE_REPOS_CACHE ?? path.join(os.homedir(), 'work/gw-multiturn-reuse'));
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 }).trim();

export function repository(id) {
  const repo = manifest.repositories.find(r => r.id === id);
  if (!repo) throw new Error('Unknown reuse repository: ' + id);
  const shared = path.join(os.homedir(), 'work/gw-real-repos/grounding', repo.id, repo.pin);
  const clone = existsSync(path.join(shared, '.git')) ? shared : path.join(cache, repo.id);
  return { ...repo, clone };
}

export function setupRepositories() {
  mkdirSync(cache, { recursive: true });
  for (const item of manifest.repositories) {
    const repo = repository(item.id);
    if (!existsSync(repo.clone)) git(cache, 'clone', '--no-checkout', repo.url, repo.clone);
    const origin = git(repo.clone, 'config', '--get', 'remote.origin.url');
    if (origin !== repo.url) throw new Error('Unexpected reuse repository origin: ' + origin);
    try { git(repo.clone, 'cat-file', '-e', repo.pin + '^{commit}'); }
    catch { git(repo.clone, 'fetch', 'origin', repo.pin); }
    if (git(repo.clone, 'rev-parse', repo.pin + '^{commit}') !== repo.pin) throw new Error('Repository pin mismatch');
    console.log(`${repo.id}: ${repo.pin} (${repo.license}) at ${repo.clone}`);
  }
}

export function archiveRepository(id) {
  const repo = repository(id);
  if (!existsSync(repo.clone)) throw new Error('Run node scripts/setup-multiturn-repos.mjs before capture/grading');
  if (git(repo.clone, 'rev-parse', repo.pin + '^{commit}') !== repo.pin) throw new Error('Repository pin mismatch');
  return execFileSync('git', ['archive', repo.pin], { cwd: repo.clone, timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
}

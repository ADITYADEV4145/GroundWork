import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const manifest = z.object({ repositories: z.array(z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  url: z.string().url().startsWith('https://github.com/'),
  end: z.string().regex(/^[a-f0-9]{40}$/),
})).length(3) });

export class GroundingReposMissing extends Error {}

export function groundingRepoLocations(project: string) {
  const repos = manifest.parse(JSON.parse(readFileSync(path.join(project, 'bench/real-repos/repos.json'), 'utf8'))).repositories;
  const cache = path.resolve(process.env.GW_REAL_REPOS_CACHE ?? path.join(os.homedir(), 'work/gw-real-repos'));
  if (cache === project || cache.startsWith(project + path.sep)) throw new Error('GW_REAL_REPOS_CACHE must be outside the GroundWork repository.');
  return repos.map((repo) => ({ ...repo, dir: path.join(cache, 'grounding', repo.id, repo.end) }));
}

export function prepareGroundingRepos(project: string): string[] {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
  return groundingRepoLocations(project).map((repo) => {
    const { dir } = repo;
    const missing = () => new GroundingReposMissing(`${repo.id}: missing pinned checkout ${repo.end} at ${dir}. Run npm run setup:grounding-repos before the full selftest; runtime never downloads repositories.`);
    if (!existsSync(path.join(dir, '.git'))) throw missing();
    if (git(dir, 'config', '--get', 'remote.origin.url') !== repo.url) throw new Error(`${dir}: unexpected origin`);
    if (git(dir, 'status', '--porcelain', '--untracked-files=all')) throw new Error(`${dir}: checkout is not clean`);
    try { git(dir, 'cat-file', '-e', `${repo.end}^{commit}`); } catch { throw missing(); }
    if (git(dir, 'rev-parse', 'HEAD') !== repo.end || git(dir, 'status', '--porcelain', '--untracked-files=all'))
      throw new Error(`${dir}: expected clean checkout at ${repo.end}`);
    return dir;
  });
}

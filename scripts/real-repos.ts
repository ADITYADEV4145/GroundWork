import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const project = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const repositorySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/), url: z.string().url().startsWith('https://github.com/'),
  role: z.string(), license: z.enum(['MIT', 'BSD-3-Clause', 'Apache-2.0']),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  start: z.string().regex(/^[a-f0-9]{40}$/), end: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();
export type Repository = z.infer<typeof repositorySchema>;
export const repositories = z.object({ repositories: z.array(repositorySchema).length(3) }).parse(
  JSON.parse(readFileSync(process.env.GW_REAL_REPOS_MANIFEST ?? path.join(project, 'bench/real-repos/repos.json'), 'utf8'))).repositories;
export const cache = path.resolve(process.env.GW_REAL_REPOS_CACHE ?? path.join(os.homedir(), 'work/gw-real-repos'));
if (cache === project || cache.startsWith(project + path.sep)) throw new Error('GW_REAL_REPOS_CACHE must be outside the GroundWork repository.');
export const clonePath = (repo: Repository) => path.join(cache, repo.id);
export const treePath = (repo: Repository) => path.join(cache, 'worktrees', repo.id);
export const git = (cwd: string, ...args: string[]) => execFileSync('git', args, {
  cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

export function monthBounds(month: string): [number, number] {
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return [start, end.getTime()];
}

export function monthCommits(repo: Repository): { eligible: string[]; excluded: string[] } {
  const [start, end] = monthBounds(repo.month);
  const lines = git(clonePath(repo), 'log', '--reverse', '--topo-order', '--no-merges', '--format=%H %cI', `${repo.start}..${repo.end}`).split('\n').filter(Boolean);
  const eligible: string[] = [], excluded: string[] = [];
  for (const line of lines) {
    const [hash, date] = line.split(' ');
    (Date.parse(date!) >= start && Date.parse(date!) < end ? eligible : excluded).push(hash!);
  }
  return { eligible, excluded };
}

export function sampleCommits(commits: string[], limit?: number): string[] {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 2)) throw new Error('A sample limit must be an integer >= 2.');
  if (limit === undefined || limit >= commits.length) return commits;
  return Array.from({ length: limit }, (_, i) => commits[Math.floor(i * (commits.length - 1) / (limit - 1))]!);
}

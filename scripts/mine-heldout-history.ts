import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mine } from './real-history-dev.js';
import { clonePath, monthBounds, type Repository } from './real-repos.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export function historyManifestForSet(set: string): string {
  if (!['original', 'heldout', 'new-1', 'new-2'].includes(set)) throw new Error('Specify a frozen evaluation set.');
  return path.join(root, 'bench/real-repos', set === 'original' ? 'repos.json' : set === 'heldout' ? 'heldout-repos.json' : `${set}-repos.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const set = process.argv[2] ?? '';
  const { repositories } = JSON.parse(readFileSync(historyManifestForSet(set), 'utf8')) as { repositories: Repository[] };
  const directory = path.join(root, 'bench/real-repos/step3/mining');
  mkdirSync(directory, { recursive: true });
  for (const repo of repositories) {
    const [start, end] = monthBounds(repo.month);
    await mine(repo.id, false, { ...repo, repoPath: clonePath(repo), startUtc: new Date(start).toISOString(), endUtcExclusive: new Date(end).toISOString(), outputFile: path.join(directory, `${set}-${repo.id}.json`) });
  }
}

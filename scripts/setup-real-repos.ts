import { existsSync, mkdirSync } from 'node:fs';
import { cache, clonePath, git, repositories, treePath } from './real-repos.js';
import path from 'node:path';

mkdirSync(cache, { recursive: true });
mkdirSync(path.join(cache, 'worktrees'), { recursive: true });
for (const repo of repositories) {
  const clone = clonePath(repo), tree = treePath(repo);
  if (!existsSync(clone)) git(cache, 'clone', '--no-checkout', repo.url, clone);
  if (git(clone, 'config', '--get', 'remote.origin.url') !== repo.url) throw new Error(`${clone}: unexpected origin; refusing to reuse.`);
  if (git(clone, 'rev-parse', '--is-shallow-repository') === 'true') git(clone, 'fetch', '--unshallow', 'origin');
  for (const pin of [repo.start, repo.end]) {
    try { git(clone, 'cat-file', '-e', `${pin}^{commit}`); }
    catch { git(clone, 'fetch', 'origin', pin); }
  }
  git(clone, 'merge-base', '--is-ancestor', repo.start, repo.end);
  if (!existsSync(tree)) git(clone, 'worktree', 'add', '--detach', tree, repo.end);
  else {
    if (git(tree, 'rev-parse', '--show-toplevel') !== tree) throw new Error(`${tree}: not the expected worktree.`);
    if (git(tree, 'status', '--porcelain', '--untracked-files=no')) throw new Error(`${tree}: tracked edits; refusing to overwrite.`);
    git(tree, 'checkout', '--detach', repo.end);
  }
  console.log(`${repo.id}: ${repo.end} at ${tree} (${repo.license}; no dependencies installed or project code executed)`);
}

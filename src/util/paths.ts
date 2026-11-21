import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const GW_DIR = '.groundwork';

/** Repo root: git toplevel when inside a git repo, else the nearest dir with .groundwork, else cwd. */
export function findRepoRoot(start = process.cwd()): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: start, stdio: ['ignore', 'pipe', 'ignore'] });
    const root = out.toString().trim();
    if (root) return path.resolve(root);
  } catch {
    // not a git repo
  }
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, GW_DIR))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export function gwPath(root: string, ...parts: string[]): string {
  return path.join(root, GW_DIR, ...parts);
}

export function ensureGwDir(root: string, ...parts: string[]): string {
  const p = gwPath(root, ...parts);
  mkdirSync(p, { recursive: true });
  return p;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

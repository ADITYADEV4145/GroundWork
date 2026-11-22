import { lstatSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function privateDirectory(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = lstatSync(dir);
  if (!st.isDirectory() || (process.getuid && st.uid !== process.getuid()) || (st.mode & 0o077))
    throw new Error('Groundwork cache/runtime directory must be private and owned by this user');
  return dir;
}

export function userCacheDirectory(): string {
  return privateDirectory(process.env.GW_CACHE_DIR ?? path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), 'groundwork'));
}

import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshIndex } from '../index/refresh.js';
import { indexDbPath } from '../index/store.js';
import { initSqlBackend, openDb, type Db } from '../store/db.js';
import { goldenSnapshot, type GoldenSnapshot } from './golden.js';

export const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/', import.meta.url));
export const FIXTURES = ['ts-app', 'py-app', 'go-app', 'rust-app', 'java-app', 'csharp-app', 'ruby-app'];

export function tempDir(prefix = 'gw-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Copy a fixture to a temp dir, index it, and hand the open index to `fn`. */
export async function withIndexedFixture<T>(name: string, fn: (db: Db, dir: string) => T | Promise<T>): Promise<T> {
  const dir = tempDir(`gw-${name}-`);
  try {
    cpSync(path.join(FIXTURES_DIR, name), dir, { recursive: true, filter: (src) => !src.endsWith('expected.json') });
    await initSqlBackend();
    await refreshIndex(dir);
    const db = openDb(indexDbPath(dir), { readonly: true });
    try {
      return await fn(db, dir);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function expectedSnapshot(name: string): GoldenSnapshot {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name, 'expected.json'), 'utf8')) as GoldenSnapshot;
}

export function diffSnapshots(expected: GoldenSnapshot, actual: GoldenSnapshot): string[] {
  const out: string[] = [];
  for (const k of Object.keys(expected) as (keyof GoldenSnapshot)[]) {
    const e = new Set(expected[k]);
    const a = new Set(actual[k]);
    for (const x of e) if (!a.has(x)) out.push(`- ${k}: ${x}`);
    for (const x of a) if (!e.has(x)) out.push(`+ ${k}: ${x}`);
  }
  return out;
}

export { goldenSnapshot };

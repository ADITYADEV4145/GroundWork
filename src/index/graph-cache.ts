import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import { loadTsPaths } from '../resolve/imports.js';
import { openDb, sqliteBackendAvailable, type Db } from '../store/db.js';
import { readMeta, SCHEMA_VERSION } from '../store/schema.js';
import { sha1 } from '../util/hash.js';
import { privateDirectory, userCacheDirectory } from '../util/user-cache.js';
import { VERSION } from '../util/version.js';
import { discoverFiles } from './discover.js';
import { EXTRACTOR_VERSION, indexConfigHash, indexDbPath } from './store.js';

const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const MAX_BYTES = 64 * 1024 * 1024;

export function graphFingerprint(root: string, config: GroundworkConfig): { key: string; files: Map<string, string> } {
  const files = new Map(discoverFiles(root, config).map((file) => [file, sha1(readFileSync(path.join(root, file)))]));
  return { key: digest(JSON.stringify([3, VERSION, SCHEMA_VERSION, EXTRACTOR_VERSION, sqliteBackendAvailable(), config, loadTsPaths(root), [...files]])), files };
}

function location(key: string): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid graph cache key');
  return path.join(privateDirectory(path.join(userCacheDirectory(), 'graphs', key.slice(0, 2))), key + '.bin');
}

/** Called under the root writer lock, only before creating a new index. */
export function restoreGraph(root: string, config: GroundworkConfig, key: string): boolean {
  let temporary: string | undefined;
  try {
    if (existsSync(indexDbPath(root))) return false;
    const file = location(key), st = lstatSync(file);
    if (!st.isFile() || st.size > MAX_BYTES || st.mode & 0o077 || (process.getuid && st.uid !== process.getuid())) return false;
    const entry = readFileSync(file), end = entry.indexOf(10);
    if (end < 0 || end > 1024) return false;
    const cached = JSON.parse(entry.subarray(0, end).toString('utf8'));
    const data = entry.subarray(end + 1);
    if (cached.key !== key || digest(data) !== cached.checksum) return false;
    temporary = indexDbPath(root) + '.' + randomUUID();
    writeFileSync(temporary, data, { mode: 0o600, flag: 'wx' });
    const db = openDb(temporary, { readonly: true });
    try {
      if (readMeta(db, 'schema_version') !== String(SCHEMA_VERSION) || readMeta(db, 'tool_version') !== `${VERSION}+x${EXTRACTOR_VERSION}` ||
        readMeta(db, 'config_hash') !== indexConfigHash(config) || db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
        db.prepare('SELECT 1 FROM reuse_embeddings LIMIT 1').get()) return false;
    } finally { db.close(); }
    renameSync(temporary, indexDbPath(root));
    return true;
  } catch { return false; }
  finally {
    if (temporary) for (const suffix of ['', '-wal', '-shm']) try { rmSync(temporary + suffix, { force: true }); } catch { /* Disposable cache. */ }
  }
}

/** The writer has closed/checkpointed the root-local database before publishing. */
export function cacheGraph(root: string, config: GroundworkConfig, key: string): void {
  let temporary: string | undefined;
  let db: Db | undefined;
  try {
    const snapshot = graphFingerprint(root, config);
    if (snapshot.key !== key) return;
    db = openDb(indexDbPath(root), { readonly: true });
    const files = db.prepare('SELECT path, hash FROM files').all();
    if (files.length !== snapshot.files.size || files.some((file) => snapshot.files.get(String(file.path)) !== file.hash)) return;
    if (db.prepare('SELECT 1 FROM reuse_embeddings LIMIT 1').get()) return;
    db.close(); db = undefined;
    const data = readFileSync(indexDbPath(root));
    if (data.length > MAX_BYTES - 1024) return;
    const file = location(key);
    temporary = file + '.' + randomUUID();
    const header = Buffer.from(JSON.stringify({ key, checksum: digest(data) }) + '\n');
    writeFileSync(temporary, Buffer.concat([header, data]), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
  } catch { /* Indexing remains the source of truth when caching fails. */ }
  finally {
    db?.close();
    if (temporary) try { rmSync(temporary, { force: true }); } catch { /* Already renamed. */ }
  }
}

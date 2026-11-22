import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deserialize, serialize } from 'node:v8';
import type { ExtractResult } from '../lang/adapter.js';
import type { Language } from '../types.js';
import { privateDirectory, userCacheDirectory } from '../util/user-cache.js';
import { EXTRACTOR_VERSION } from './store.js';

const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const MAX_BYTES = 32 * 1024 * 1024;

export function extractionKey(hash: string, language: Language): string {
  return digest(JSON.stringify([1, EXTRACTOR_VERSION, language, hash]));
}

function location(key: string): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid extraction cache key');
  const dir = privateDirectory(path.join(userCacheDirectory(), 'extraction', key.slice(0, 2)));
  return path.join(dir, key + '.bin');
}

export function readExtraction(key: string): ExtractResult | null {
  try {
    const file = location(key), st = lstatSync(file);
    if (!st.isFile() || st.size > MAX_BYTES || (st.mode & 0o077) || (process.getuid && st.uid !== process.getuid())) return null;
    const envelope = deserialize(readFileSync(file));
    if (envelope.key !== key || !Buffer.isBuffer(envelope.data) || digest(envelope.data) !== envelope.checksum) return null;
    const result = deserialize(envelope.data) as ExtractResult;
    if (typeof result.hasErrors !== 'boolean' || ![result.symbols, result.calls, result.imports, result.literals, result.exportAliases].every(Array.isArray)) return null;
    for (const symbol of result.symbols) {
      if (typeof symbol.name !== 'string' || typeof symbol.qualifiedName !== 'string' || !Array.isArray(symbol.params) ||
        (symbol.fingerprint && (!(symbol.fingerprint.minhash instanceof Uint32Array) || symbol.fingerprint.minhash.length !== 128))) return null;
    }
    return result;
  } catch { return null; }
}

export function cacheExtraction(key: string, result: ExtractResult): void {
  let temp: string | undefined;
  try {
    const data = serialize(result);
    if (data.length > MAX_BYTES - 1024) return;
    const file = location(key);
    temp = file + '.' + randomUUID();
    writeFileSync(temp, serialize({ key, checksum: digest(data), data }), { mode: 0o600, flag: 'wx' });
    renameSync(temp, file);
  } catch { /* Disposable cache: parsing remains the source of truth. */ }
  finally { if (temp) try { unlinkSync(temp); } catch { /* Already renamed or unavailable. */ } }
}

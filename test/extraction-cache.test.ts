import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { extractionKey, readExtraction } from '../src/index/extraction-cache.js';
import { findCode } from '../src/index/navigation.js';
import { readFingerprintedSymbols } from '../src/index/query.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import * as parser from '../src/lang/parser.js';
import { typescriptAdapter } from '../src/lang/typescript.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { sha1 } from '../src/util/hash.js';

const source = 'export function normalize(value: string) { const result = value.trim().toLowerCase(); if (!result) throw new Error("empty"); return result; }';

describe('shared extraction cache', () => {
  it('reuses typed extraction across roots, regenerates file IDs and invalidates on source/language changes', async () => {
    const root = tempDir('gw-extraction-cache-'), init = vi.spyOn(parser, 'initParsersFor'), extract = vi.spyOn(typescriptAdapter, 'extract');
    const cache = path.join(root, 'cache');
    vi.stubEnv('GW_CACHE_DIR', cache);
    try {
      await initSqlBackend();
      const first = path.join(root, 'first'), second = path.join(root, 'second');
      mkdirSync(first); mkdirSync(second);
      writeFileSync(path.join(first, 'first.ts'), source);
      await refreshIndex(first);
      const key = extractionKey(sha1(source), 'typescript');
      const hit = readExtraction(key)!;
      expect(hit.symbols[0]!.fingerprint!.minhash).toBeInstanceOf(Uint32Array);
      expect(extractionKey(sha1(source), 'javascript')).not.toBe(key);
      expect(extractionKey(sha1(source + '\n'), 'typescript')).not.toBe(key);
      init.mockClear();
      extract.mockClear();
      writeFileSync(path.join(second, 'moved.ts'), source);
      await refreshIndex(second);
      expect(init).toHaveBeenCalledWith(['typescript']);
      expect(extract).not.toHaveBeenCalled();
      const db = openDb(indexDbPath(second), { readonly: true });
      try {
        expect(findCode(db, 'normalize')[0]!.file).toBe('moved.ts');
        expect(readFingerprintedSymbols(db)[0]!.fingerprint.minhash).toEqual(hit.symbols[0]!.fingerprint!.minhash);
      } finally { db.close(); }
      await refreshIndex(second, { full: true });
      expect(init).toHaveBeenCalledWith(['typescript']);
      expect(extract).toHaveBeenCalled();
      init.mockClear();
      writeFileSync(path.join(second, 'moved.ts'), source.replace('normalize', 'renamed'));
      await refreshIndex(second);
      expect(init).toHaveBeenCalledWith(['typescript']);
    } finally { init.mockRestore(); extract.mockRestore(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); }
  });

  it('ignores corrupt, insecure and unavailable entries and still indexes from source', async () => {
    const root = tempDir('gw-extraction-corrupt-');
    const cache = path.join(root, 'cache');
    vi.stubEnv('GW_CACHE_DIR', cache);
    try {
      await initSqlBackend();
      const first = path.join(root, 'first'), second = path.join(root, 'second');
      mkdirSync(first); mkdirSync(second);
      writeFileSync(path.join(first, 'first.ts'), source);
      await refreshIndex(first);
      const key = extractionKey(sha1(source), 'typescript');
      const file = path.join(cache, 'extraction', key.slice(0, 2), key + '.bin');
      const valid = readFileSync(file);
      writeFileSync(file, 'corrupt');
      expect(readExtraction(key)).toBeNull();
      writeFileSync(path.join(second, 'second.ts'), source);
      expect((await refreshIndex(second)).added).toBe(1);
      writeFileSync(file, valid);
      chmodSync(file, 0o666);
      expect(readExtraction(key)).toBeNull();
      rmSync(file); symlinkSync(path.join(first, 'first.ts'), file);
      expect(readExtraction(key)).toBeNull();
      vi.stubEnv('GW_CACHE_DIR', path.join(first, 'first.ts'));
      writeFileSync(path.join(second, 'new.ts'), source.replace('normalize', 'another'));
      expect((await refreshIndex(second)).added).toBe(1);
    } finally { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); }
  });
});

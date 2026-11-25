import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import * as graph from '../src/index/graph-cache.js';
import { findCode } from '../src/index/navigation.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { readMeta } from '../src/store/schema.js';

const source = 'export function original() { return 1; }';
const dirs: string[] = [];
function setup() {
  const home = tempDir('gw-graph-'); dirs.push(home);
  vi.stubEnv('GW_CACHE_DIR', path.join(home, 'cache'));
  const root = (name: string, content = source) => {
    const dir = path.join(home, name); mkdirSync(dir);
    writeFileSync(path.join(dir, 'a.ts'), content);
    return dir;
  };
  return { home, root };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('root-local graph cache', () => {
  it('hydrates independent indexes without copying session ledgers and detects later mutations', async () => {
    await initSqlBackend();
    const { root } = setup(), first = root('first'), second = root('second');
    expect((await refreshIndex(first)).graphCacheHit).not.toBe(true);
    mkdirSync(path.join(first, '.groundwork', 'sessions'));
    writeFileSync(path.join(first, '.groundwork', 'sessions', 'private.json'), '{}');
    expect((await refreshIndex(second)).graphCacheHit).toBe(true);
    expect(statSync(indexDbPath(first)).ino).not.toBe(statSync(indexDbPath(second)).ino);
    expect(existsSync(path.join(second, '.groundwork', 'sessions'))).toBe(false);
    const firstDb = openDb(indexDbPath(first), { readonly: true }), secondDb = openDb(indexDbPath(second), { readonly: true });
    try { expect(readMeta(firstDb, 'generation')).not.toBe(readMeta(secondDb, 'generation')); }
    finally { firstDb.close(); secondDb.close(); }
    writeFileSync(path.join(second, 'a.ts'), source.replace('original', 'modified'));
    await refreshIndex(second);
    for (const [dir, name] of [[first, 'original'], [second, 'modified']]) {
      const db = openDb(indexDbPath(dir!), { readonly: true });
      try { expect(findCode(db, name!)[0]!.name).toBe(name); } finally { db.close(); }
    }
  });

  it('rehashes restored files even when content changes after keying with unchanged size and mtime', async () => {
    await initSqlBackend();
    const { root } = setup(), first = root('first'), second = root('second');
    await refreshIndex(first);
    const restore = graph.restoreGraph;
    vi.spyOn(graph, 'restoreGraph').mockImplementation((dir, config, key) => {
      const hit = restore(dir, config, key);
      const file = path.join(dir, 'a.ts'), st = statSync(file);
      writeFileSync(file, source.replace('original', 'modified'));
      utimesSync(file, st.atime, st.mtime);
      return hit;
    });
    expect((await refreshIndex(second)).graphCacheHit).toBe(true);
    const db = openDb(indexDbPath(second), { readonly: true });
    try { expect(findCode(db, 'modified')[0]!.name).toBe('modified'); } finally { db.close(); }
  });

  it('keys dirty/untracked content, deletions, config, and resolver settings rather than git HEAD', async () => {
    await initSqlBackend();
    const { root } = setup(), first = root('first');
    await refreshIndex(first);
    const config = defaultConfig(), key = graph.graphFingerprint(first, config).key;
    const dirty = root('dirty', source.replace('return 1', 'return 2'));
    expect((await refreshIndex(dirty)).graphCacheHit).not.toBe(true);
    writeFileSync(path.join(first, 'extra.ts'), 'export const extra = 1;');
    expect(graph.graphFingerprint(first, config).key).not.toBe(key);
    rmSync(path.join(first, 'extra.ts'));
    expect(graph.graphFingerprint(first, config).key).toBe(key);
    writeFileSync(path.join(first, 'tsconfig.json'), '{"compilerOptions":{"paths":{"alias":["a.ts"]}}}');
    expect(graph.graphFingerprint(first, config).key).not.toBe(key);
    rmSync(path.join(first, 'tsconfig.json'));
    config.index.exclude = ['a.ts'];
    expect(graph.graphFingerprint(first, config).key).not.toBe(key);
    rmSync(path.join(first, 'a.ts'));
    expect(graph.graphFingerprint(first, defaultConfig()).key).not.toBe(key);
  });

  it('treats corrupt, insecure and unavailable cache entries as misses', async () => {
    await initSqlBackend();
    const { root, home } = setup(), first = root('first');
    await refreshIndex(first);
    const key = graph.graphFingerprint(first, defaultConfig()).key;
    const file = path.join(home, 'cache', 'graphs', key.slice(0, 2), key + '.bin');
    const valid = readFileSync(file);
    writeFileSync(file, 'broken');
    expect((await refreshIndex(root('corrupt'))).graphCacheHit).not.toBe(true);
    writeFileSync(file, valid); chmodSync(file, 0o666);
    expect((await refreshIndex(root('insecure'))).graphCacheHit).not.toBe(true);
    rmSync(path.join(home, 'cache'), { recursive: true });
    writeFileSync(path.join(home, 'cache'), 'not a directory');
    expect((await refreshIndex(root('unavailable'))).added).toBe(1);
  });

  it('handles empty roots and bypasses graph reuse for explicit full rebuilds', async () => {
    await initSqlBackend();
    const { root } = setup(), first = root('first', ''), second = root('second', '');
    rmSync(path.join(first, 'a.ts')); rmSync(path.join(second, 'a.ts'));
    await refreshIndex(first);
    expect((await refreshIndex(second)).graphCacheHit).toBe(true);
    const full = root('full', ''); rmSync(path.join(full, 'a.ts'));
    expect((await refreshIndex(full, { full: true })).graphCacheHit).not.toBe(true);
  });

  it('invalidates graph keys on extractor and schema version changes', async () => {
    const { root } = setup(), dir = root('first'), config = defaultConfig();
    const key = graph.graphFingerprint(dir, config).key;
    try {
      vi.resetModules();
      vi.doMock('../src/index/store.js', async original => ({ ...await original<typeof import('../src/index/store.js')>(), EXTRACTOR_VERSION: 999 }));
      expect((await import('../src/index/graph-cache.js')).graphFingerprint(dir, config).key).not.toBe(key);
      vi.doUnmock('../src/index/store.js'); vi.resetModules();
      vi.doMock('../src/store/schema.js', async original => ({ ...await original<typeof import('../src/store/schema.js')>(), SCHEMA_VERSION: 999 }));
      expect((await import('../src/index/graph-cache.js')).graphFingerprint(dir, config).key).not.toBe(key);
    } finally { vi.doUnmock('../src/index/store.js'); vi.doUnmock('../src/store/schema.js'); vi.resetModules(); }
  });
});

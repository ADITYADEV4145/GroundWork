import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { indexGeneration } from '../src/index/query.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import * as parser from '../src/lang/parser.js';
import { findSimilarTool } from '../src/mcp/tools/find_similar.js';
import { verifyCallsTool } from '../src/mcp/tools/verify_calls.js';
import { cachedCandidates } from '../src/reuse/candidate-cache.js';
import { tempDir, withIndexedFixture } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

describe('incremental runtime overhead', () => {
  it('initializes only changed languages, skips warm/empty refreshes, and invalidates on config changes', async () => {
    const root = tempDir('gw-freshness-');
    vi.stubEnv('GW_CACHE_DIR', path.join(root, 'cache'));
    const init = vi.spyOn(parser, 'initParsersFor');
    try {
      await initSqlBackend();
      await refreshIndex(root);
      expect(init).not.toHaveBeenCalled();
      writeFileSync(path.join(root, 'first.ts'), 'export function first() { return 1; }');
      expect((await refreshIndex(root)).added).toBe(1);
      expect(init.mock.calls).toEqual([[['typescript']]]);
      init.mockClear();
      await refreshIndex(root);
      expect(init).not.toHaveBeenCalled();
      writeFileSync(path.join(root, 'untracked.py'), 'def second():\n    return 2\n');
      expect((await refreshIndex(root)).added).toBe(1);
      expect(init.mock.calls).toEqual([[['python']]]);
      init.mockClear();
      const config = defaultConfig();
      config.index.exclude = ['**/*.ts'];
      const changed = await refreshIndex(root, { config });
      expect(changed.rebuilt).toBe(true);
      expect(changed.files).toBe(1);
      expect(init.mock.calls).toEqual([[['python']]]);
    } finally { vi.unstubAllEnvs(); init.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });

  it('reuses candidates only for the same root, generation and config', async () => {
    await withIndexedFixture('reuse-app', async (_db, root) => {
      const config = defaultConfig();
      const get = async () => {
        const db = openDb(indexDbPath(root), { readonly: true });
        try { return { index: await cachedCandidates(db, root, config), generation: indexGeneration(db) }; }
        finally { db.close(); }
      };
      const first = await get();
      expect(first.generation).toBeTruthy();
      await refreshIndex(root);
      expect(await get()).toEqual(first);
      expect((await get()).index).toBe(first.index);
      config.reuse.skipTests = false;
      const configured = await get();
      expect(configured.index).not.toBe(first.index);
      expect(configured.index.symbols.some((s) => s.isTest)).toBe(true);
      writeFileSync(path.join(root, 'brand-new.ts'), 'export function brandNew(value: string) { const result = value.trim().toLowerCase(); if (!result) throw new Error("empty"); return result; }');
      await refreshIndex(root);
      const added = await get();
      expect(added.generation).not.toBe(first.generation);
      expect(added.index).not.toBe(configured.index);
      expect(added.index.symbols.some((s) => s.name === 'brandNew')).toBe(true);
      rmSync(path.join(root, 'brand-new.ts'));
      await refreshIndex(root);
      expect((await get()).index.symbols.some((s) => s.name === 'brandNew')).toBe(false);
      await withIndexedFixture('reuse-app', async (otherDb, otherRoot) => {
        expect(await cachedCandidates(otherDb, otherRoot, config)).not.toBe((await get()).index);
      });
    });
  });

  it('keeps no-match output minimal and validates input', async () => {
    await withIndexedFixture('reuse-app', async (db, root) => {
      const ctx = { root, db, config: defaultConfig() };
      expect(await findSimilarTool.handler({ description: 'quuxxyzzy', language: 'typescript' }, ctx)).toBe('No matches.');
      await expect(findSimilarTool.handler({ description: '', language: 'typescript' }, ctx)).rejects.toThrow();
    });
  });

  it('batches all files, keeps clean results short, and preserves findings and unchecked status', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { root, db, config: defaultConfig() };
      expect(await verifyCallsTool.handler({ files: [{ file: 'src/utils/date.ts' }, { file: 'src/utils/text.ts' }] }, ctx)).toBe('ok');
      expect(await verifyCallsTool.handler({ file: 'src/utils/date.ts', lines: '1-5' }, ctx)).toBe('ok');
      mkdirSync(path.join(root, 'new'), { recursive: true });
      writeFileSync(path.join(root, 'new/bad.ts'), "import { nonexistent } from '../src/utils/date';\nnonexistent();\n");
      await refreshIndex(root);
      const current = openDb(indexDbPath(root), { readonly: true });
      try {
        const text = await verifyCallsTool.handler({ files: [{ file: 'src/utils/date.ts' }, { file: 'new/bad.ts' }, { file: 'missing.ts' }] }, { ...ctx, db: current });
        expect(text).toContain('nonexistent');
        expect(text).toContain('not checked');
        expect(text).not.toBe('ok');
      } finally { current.close(); }
      await expect(verifyCallsTool.handler({}, ctx)).rejects.toThrow('Provide');
      await expect(verifyCallsTool.handler({ files: [] }, ctx)).rejects.toThrow('Provide');
      await expect(verifyCallsTool.handler({ file: 'a.ts', files: [{ file: 'b.ts' }] }, ctx)).rejects.toThrow('Provide');
      await expect(verifyCallsTool.handler({ file: 'a.ts', lines: 'not-lines' }, ctx)).rejects.toThrow();
    });
  });
});

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Grounder } from '../src/grounding/index.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

describe('long-horizon build-output imports', () => {
  it('grounds source-only scripts without hiding missing source imports', async () => {
    const root = tempDir('gw-lh-grounding-');
    try {
      const suite = path.join(root, 'bench/long-horizon');
      mkdirSync(suite, { recursive: true });
      for (const file of ['metrics.mjs', 'verify-results.mjs', 'evaluator-fingerprint.mjs']) {
        cpSync(new URL(`../bench/long-horizon/${file}`, import.meta.url), path.join(suite, file));
      }
      writeFileSync(path.join(suite, 'broken.mjs'), "import { missing } from './missing.mjs';\nmissing();\n");
      expect(existsSync(path.join(root, 'dist'))).toBe(false);
      await initSqlBackend();
      await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const grounder = new Grounder(db, root);
        for (const file of ['metrics.mjs', 'verify-results.mjs']) {
          const result = grounder.verify(`bench/long-horizon/${file}`);
          expect(result.unchecked).toBeNull();
          expect(result.findings).toEqual([]);
        }
        expect(grounder.verify('bench/long-horizon/broken.mjs').findings).toEqual([
          expect.objectContaining({ kind: 'missing-module', name: './missing.mjs' }),
        ]);
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

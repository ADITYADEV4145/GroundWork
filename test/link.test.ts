import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { goldenSnapshot, tempDir } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

describe('global call name resolution', () => {
  it('shares TS/TSX/JS candidates without mixing in Go, on full and incremental links', async () => {
    const root = tempDir('gw-link-family-');
    const target = 'export function Shared() {}\nexport function TsOnly() {}\n';
    try {
      writeFileSync(path.join(root, 'target.ts'), target);
      writeFileSync(path.join(root, 'view.tsx'), 'Shared();\nTsOnly();\nGoOnly();\nexport function ViewOnly() {}\n');
      writeFileSync(path.join(root, 'client.js'), 'Shared();\nViewOnly();\n');
      writeFileSync(path.join(root, 'target.go'), 'package demo\nfunc Shared() {}\nfunc GoOnly() {}\n');
      writeFileSync(path.join(root, 'caller.go'), 'package demo\nfunc Run() { TsOnly() }\n');
      await initSqlBackend();
      const check = () => {
        const db = openDb(indexDbPath(root), { readonly: true });
        try {
          expect(goldenSnapshot(db).calls).toEqual([
            'caller.go | 2 | TsOnly | 0 | [] | - | -',
            'client.js | 1 | Shared | 0 | [] | Shared | name-only',
            'client.js | 2 | ViewOnly | 0 | [] | ViewOnly | name-only',
            'view.tsx | 1 | Shared | 0 | [] | Shared | name-only',
            'view.tsx | 2 | TsOnly | 0 | [] | TsOnly | name-only',
            'view.tsx | 3 | GoOnly | 0 | [] | - | -',
          ]);
        } finally { db.close(); }
      };
      await refreshIndex(root, { full: true });
      check();
      writeFileSync(path.join(root, 'target.ts'), target.replace('Shared() {}', 'Shared() { return 1; }'));
      await refreshIndex(root);
      check();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import { workspaceFingerprint } from '../src/guards/repeat.js';
import { duplicateGate } from '../src/hooks/handlers/duplicate_gate.js';
import { beforeWriteTool } from '../src/mcp/tools/before_write.js';
import { TOOLS } from '../src/mcp/tools/index.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { withIndexedFixture } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { estimateTokens } from '../src/util/tokens.js';

describe('before_write', () => {
  it('answers reuse, signatures and callers in one budgeted call', async () => {
    await withIndexedFixture('reuse-app', async (db, root) => {
      const ctx = { root, db, config: configSchema.parse({}) };
      expect(TOOLS.some((t) => t.name === 'before_write')).toBe(true);
      const text = await beforeWriteTool.handler({
        new: { description: 'parse a date string into a Date' },
        calls: ['parseDateString', 'noSuchHelperAnywhere'],
        changes: ['parseDateString'],
      }, ctx);
      expect(text).toMatch(/^Reuse\n/);
      expect(text).toContain('Signatures\n');
      expect(text).toContain('parseDateString');
      expect(text).toContain('noSuchHelperAnywhere: not in the index');
      expect(text).toMatch(/Callers to update\n.*(call site\(s\) in \d+ file\(s\)|no indexed callers)/);
      expect(estimateTokens(text)).toBeLessThanOrEqual(700);
      const only = await beforeWriteTool.handler({ calls: ['parseDateString'] }, ctx);
      expect(only).not.toContain('Reuse');
      expect(only).not.toContain('Callers');
      await expect(beforeWriteTool.handler({}, ctx)).rejects.toThrow('Provide new, calls, changes or decision');
    });
  });

  it('refuses ambiguous file-qualified names and pages every caller', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gw-bw-'));
    try {
      writeFileSync(path.join(root, 'models.ts'), 'export class A { save(): number { return 1; } }\nexport class B { save(): number { return 2; } }\nexport function hot(n: number): number { return n; }\n');
      for (let i = 0; i < 7; i++) writeFileSync(path.join(root, `use${i}.ts`), "import { hot } from './models';\n"
        + Array.from({ length: 10 }, (_, j) => `export function f${i}_${j}(): number { return hot(${j}); }`).join('\n') + '\n');
      await initSqlBackend();
      await refreshIndex(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try {
        const ctx = { root, db, config: configSchema.parse({}) };
        const ambiguous = await beforeWriteTool.handler({ changes: ['models.ts:save'] }, ctx);
        expect(ambiguous).toContain('2 symbols match');
        expect(ambiguous).toContain('A.save');
        expect(ambiguous).toContain('B.save');
        expect(await beforeWriteTool.handler({ changes: ['models.ts:B.save'] }, ctx)).not.toContain('symbols match');
        const seen = new Set<string>();
        const sites = (text: string) => text.split('\n').filter((l) => /^  use\d\.ts:\d+ in /.test(l));
        const first = await beforeWriteTool.handler({ changes: ['hot'] }, ctx);
        expect(first).toContain('70 call site(s) in 7 file(s)');
        expect(first).toContain('62 more: expand "callers", offset 8');
        let offset = 0;
        for (let page = 0; page < 5 && seen.size < 70; page++) {
          const text = await beforeWriteTool.handler({ changes: ['hot'], expand: 'callers', offset }, ctx);
          expect(text).not.toContain('over budget');
          const rows = sites(text);
          expect(rows.length).toBeGreaterThan(0);
          for (const row of rows) { expect(seen.has(row)).toBe(false); seen.add(row); }
          offset += rows.length;
        }
        expect(seen.size).toBe(70);
      } finally { db.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('cheap hook paths', () => {
  const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  function repo(): string {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gw-cheap-'));
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 't@example.com');
    git(root, 'config', 'user.name', 't');
    writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
    writeFileSync(path.join(root, 'b.ts'), 'export const b = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'init');
    return root;
  }

  it('fingerprints every kind of working-tree change', () => {
    const root = repo();
    try {
      const seen = new Set([workspaceFingerprint(root)]);
      const step = () => { const f = workspaceFingerprint(root); expect(f).not.toBe('unknown'); expect(seen.has(f)).toBe(false); seen.add(f); };
      expect(workspaceFingerprint(root)).toBe([...seen][0]);
      writeFileSync(path.join(root, 'a.ts'), 'export const a = 2;\n'); step();
      writeFileSync(path.join(root, 'a.ts'), 'export const a = 3;\n'); step();
      writeFileSync(path.join(root, 'new file.ts'), 'export const n = 1;\n'); step();
      writeFileSync(path.join(root, 'new file.ts'), 'export const n = 2;\n'); step();
      git(root, 'mv', 'b.ts', 'c.ts'); step();
      writeFileSync(path.join(root, 'c.ts'), 'export const b = 2;\n'); step();
      git(root, 'add', '.'); writeFileSync(path.join(root, 'c.ts'), 'export const b = 3;\n'); step();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('skips the full gate at Stop when nothing changed since HEAD', async () => {
    const root = repo();
    try {
      const config = configSchema.parse({});
      const start = performance.now();
      const result = await duplicateGate.run({ event: 'stop', agent: 'claude', sessionId: 's', cwd: root, raw: {} } as never, { root, config });
      expect(result).toMatchObject({ action: 'allow' });
      expect(performance.now() - start).toBeLessThan(1000);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

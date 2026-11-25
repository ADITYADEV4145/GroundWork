import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { runNavigationTool } from '../src/selftest/checks/phase2.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

it('reads bounded resolved traces, paginates without losing definitions, and handles invalid or stale source', async () => {
  const root = tempDir('gw-trace-'), config = defaultConfig();
  try {
    const file = path.join(root, 'trace.ts');
    writeFileSync(file, 'export function start() { return middle(); }\nfunction middle() { return end(); }\nfunction end() { return middle(); }\nfunction empty() {}\n');
    await initSqlBackend(); await refreshIndex(root);
    const db = openDb(indexDbPath(root), { readonly: true }), ctx = { root, config, db };
    try {
      const ordinary = await runNavigationTool('read_symbol', { symbol: 'start' }, ctx);
      expect(ordinary).not.toContain('function middle');
      const direct = await runNavigationTool('read_symbol', { symbol: 'start', callee_depth: 1 }, ctx);
      expect(direct).toContain('function middle'); expect(direct).not.toContain('function end');
      const trace = await runNavigationTool('read_symbol', { symbol: 'start', callee_depth: 2 }, ctx);
      expect(trace).toContain('function start'); expect(trace).toContain('function middle'); expect(trace).toContain('function end');
      expect(Buffer.byteLength(trace)).toBeLessThanOrEqual(4800);
      expect(await runNavigationTool('read_symbol', { symbol: 'empty', callee_depth: 2 }, ctx)).toContain('function empty');
      expect(await runNavigationTool('read_symbol', { symbol: 'missing', callee_depth: 2 }, ctx)).toContain('No exact symbol');
      expect(await runNavigationTool('read_symbol', { symbols: ['start'], callee_depth: 2 }, ctx)).toContain('one symbol');
      expect(await runNavigationTool('read_symbol', { symbol: 'start', offset: 1, callee_depth: 2 }, ctx)).toContain('no source offset');
      await expect(runNavigationTool('read_symbol', { symbol: 'start', callee_depth: 3 }, ctx)).rejects.toThrow();
      writeFileSync(file, 'export function changed() {}');
      expect(await runNavigationTool('read_symbol', { symbol: 'start', callee_depth: 2 }, ctx)).toContain('changed after indexing');
    } finally { db.close(); }
    writeFileSync(file, 'export function start() { ' + Array.from({ length: 12 }, (_, i) => `f${i}();`).join(' ') + ' }\n' +
      Array.from({ length: 12 }, (_, i) => `function f${i}() { return "${'x'.repeat(500)}"; }`).join('\n'));
    await refreshIndex(root);
    const many = openDb(indexDbPath(root), { readonly: true });
    try {
      let args: Record<string, unknown> = { symbol: 'start', callee_depth: 2 }, all = '';
      for (let i = 0; i < 20; i++) {
        const text = await runNavigationTool('read_symbol', args, { root, config, db: many });
        expect(Buffer.byteLength(text)).toBeLessThanOrEqual(4800); all += text;
        const next = [...text.matchAll(/Next: read_symbol\(([^\n]+)\)/g)].map(m => JSON.parse(m[1]!)).find(a => a.callee_depth);
        if (!next) break;
        expect(next.symbol_offset).toBeGreaterThan(Number(args.symbol_offset ?? 0)); args = next;
      }
      for (let i = 0; i < 12; i++) expect(all).toContain(`function f${i}()`);
    } finally { many.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

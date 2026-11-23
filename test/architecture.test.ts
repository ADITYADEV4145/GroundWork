import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { readLedger, recordReuseDecision } from '../src/guards/ledger.js';
import { architecture, packageOf, renderArchitecture } from '../src/index/architecture.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { beforeWriteTool } from '../src/mcp/tools/before_write.js';
import { TOOLS } from '../src/mcp/tools/index.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { estimateTokens } from '../src/util/tokens.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-arch-')); roots.push(root);
  const write = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  write('package.json', JSON.stringify({ name: 'app', bin: { app: 'src/cli/main.ts' } }));
  write('src/util/format.ts', 'export function formatMoney(cents: number): string { return (cents / 100).toFixed(2); }\nexport function padLeft(text: string, width: number): string { return text.padStart(width); }\n');
  write('src/orders/total.ts', 'import { formatMoney } from "../util/format.js";\nexport function orderTotal(items: number[]): string { return formatMoney(items.reduce((a, b) => a + b, 0)); }\n');
  write('src/orders/refund.ts', 'import { formatMoney } from "../util/format.js";\nexport function refundAmount(cents: number): string { return formatMoney(-cents); }\n');
  write('src/cli/main.ts', 'import { orderTotal } from "../orders/total.js";\nimport { refundAmount } from "../orders/refund.js";\nimport { formatMoney } from "../util/format.js";\nexport function runMain(): string { return orderTotal([1]) + refundAmount(1) + formatMoney(1); }\n');
  write('src/orders/total.test.ts', 'import { orderTotal } from "./total.js";\norderTotal([]);\n');
  const config = defaultConfig();
  await initSqlBackend(); await refreshIndex(root, { config });
  return { root, config, db: openDb(indexDbPath(root), { readonly: true }) };
}

describe('architecture', () => {
  it('groups files into packages', () => {
    expect(packageOf('src/cli/main.ts')).toBe('src/cli');
    expect(packageOf('src/api.ts')).toBe('src');
    expect(packageOf('scripts/a/b.ts')).toBe('scripts');
    expect(packageOf('README.md')).toBe('.');
  });

  it('reports packages, entry points, dependencies, hot helpers and conventions within budget', async () => {
    const { root, db } = await fixture();
    try {
      const a = architecture(db, root);
      expect(a.packages.map((p) => p.dir).sort()).toEqual(['src/cli', 'src/orders', 'src/util']);
      expect(a.entryPoints[0]).toEqual({ file: 'src/cli/main.ts', why: 'package.json bin app' });
      expect(a.entryPoints).toHaveLength(1);
      expect(a.layers).toContainEqual({ from: 'src/orders', to: 'src/util', imports: 2 });
      expect(a.layers).toContainEqual({ from: 'src/cli', to: 'src/orders', imports: 2 });
      expect(a.layers.some((e) => e.from === 'src/util')).toBe(false);
      expect(a.hotUtilities[0]).toMatchObject({ package: 'src/util', symbol: 'formatMoney', callers: 3 });
      expect(a.hotUtilities.some((h) => h.symbol === 'padLeft')).toBe(false);
      expect(a.naming.functions.typescript).toMatch(/^camelCase/);
      expect(a.naming.tests).toBe('*.test.*');
      expect(architecture(db, root)).toEqual(a);
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'app', main: 'src/orders/total.ts' }));
      expect(architecture(db, root).entryPoints).toEqual([{ file: 'src/orders/total.ts', why: 'package.json main' }, { file: 'src/cli/main.ts', why: 'imported by nothing, imports 3 files' }]);
      const text = renderArchitecture(a, 300);
      expect(text).toContain('Reuse these');
      expect(text).toContain('src/orders → src/util (2)');
      expect(estimateTokens(text)).toBeLessThanOrEqual(300);
      expect(renderArchitecture(a, 100).split('\n').length).toBeLessThan(text.split('\n').length);
      expect(TOOLS.some((t) => t.name === 'architecture')).toBe(true);
    } finally { db.close(); }
  });
});

describe('before_write reuse candidates and decision', () => {
  it('shows the signature, usage count and one call site of each candidate', async () => {
    const { root, db, config } = await fixture();
    try {
      const text = await beforeWriteTool.handler({ new: { description: 'sum the order items into a total string', name: 'sumOrder', signature: 'sumOrder(items: number[]): string' }, expand: 'reuse' }, { root, db, config });
      const row = text.split('\n').find((l) => l.includes('src/orders/total.ts:2'))!;
      expect(row).toContain('orderTotal(items: number[]): string');
      expect(row).toMatch(/2 call\(s\), e\.g\. src\/\S+:\d+/);
    } finally { db.close(); }
  });

  it('records the REUSE / EXTEND / NEW decision in the session ledger', async () => {
    const { root, db, config } = await fixture();
    const before = process.env.GW_SESSION_ID;
    try {
      process.env.GW_SESSION_ID = 's1';
      expect(await beforeWriteTool.handler({ decision: { choice: 'reuse', reason: 'formatMoney already\n does this' } }, { root, db, config })).toBe('Decision recorded: REUSE');
      expect(readLedger(root, 's1').reuseDecisions).toEqual([{ choice: 'reuse', reason: 'formatMoney already does this' }]);
      delete process.env.GW_SESSION_ID;
      expect(await beforeWriteTool.handler({ decision: { choice: 'new', reason: 'nothing close' } }, { root, db, config })).toContain('not recorded');
      for (let i = 0; i < 60; i++) recordReuseDecision(root, 's1', 'new', `r${i}`);
      expect(readLedger(root, 's1').reuseDecisions).toHaveLength(50);
    } finally { db.close(); if (before === undefined) delete process.env.GW_SESSION_ID; else process.env.GW_SESSION_ID = before; }
  });
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { updateLedger } from '../src/guards/ledger.js';
import { dispatch } from '../src/hooks/run.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { changedFromDiff, renderScan, scanRepository, toSarif } from '../src/scan/index.js';
import { textPng } from '../src/scan/png.js';
import { buildReceipt, receiptLines } from '../src/scan/receipt.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

const roots: string[] = [];
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const body = (name: string) => `export function ${name}(items: number[], size: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < items.length; i += size) {
    const part = items.slice(i, i + size);
    if (part.length > 0) out.push(part);
  }
  return out;
}
`;
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-scan-')); roots.push(root);
  const write = (file: string, text: string) => writeFileSync(path.join(root, file), text);
  write('.gitignore', '.groundwork/\n');
  write('lists.ts', body('chunk') + 'export function total(a: number, b: number): number { return a + b; }\nexport const DEFAULT_TIMEOUT_MS = 45000;\n');
  write('copy.ts', body('splitEvery') + 'function unusedHelper(): number { return 1; }\nexport const DEFAULT_TIMEOUT_MS = 45000;\n');
  write('use.ts', 'import { total, missing } from "./lists.js";\nexport const sum = total(1);\nexport const other = missing;\n');
  git(root, 'init'); git(root, 'add', '.');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base');
  return root;
}
async function open(root: string) {
  const config = defaultConfig();
  await initSqlBackend(); await refreshIndex(root, { config });
  return { config, db: openDb(indexDbPath(root), { readonly: true }) };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('gw scan', () => {
  it('reports each defect kind in a repository that was never set up', async () => {
    const root = fixture();
    const { config, db } = await open(root);
    try {
      const report = await scanRepository(db, root, { config });
      const at = (kind: string) => report.findings.filter((f) => f.kind === kind).map((f) => `${f.file}:${f.line}`);
      expect(at('invented-call')).toEqual(['use.ts:1']);
      expect(at('wrong-arguments')).toEqual(['use.ts:2']);
      expect(report.findings.find((f) => f.kind === 'duplicate-logic')).toMatchObject({ file: 'lists.ts', suggestion: 'splitEvery (copy.ts:1)' });
      expect(at('duplicate-constant')).toEqual(['lists.ts:10']);
      expect(at('dead-code')).toEqual(['copy.ts:9']);
      expect(report.counts['type-error']).toBe(0);
      expect(report.skipped.join()).toContain('type errors');
      const text = renderScan(report);
      expect(text.split('\n').length).toBeLessThan(25);
      expect(text).toContain('1 invented calls');
      const sarif = toSarif(report) as { version: string; runs: { results: { ruleId: string; locations: unknown[] }[] }[] };
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.runs[0]!.results).toHaveLength(report.findings.length + report.check.length);
    } finally { db.close(); }
  });

  it('limits a diff scan to the lines the diff adds', async () => {
    const root = fixture();
    const { config, db } = await open(root);
    config.types.enabled = false;
    try {
      const changed = changedFromDiff('--- a/use.ts\n+++ b/use.ts\n@@ -2,0 +2,1 @@\n+export const sum = total(1);\n--- a/gone.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-x\n-y\n');
      expect(changed).toEqual([{ file: 'use.ts', ranges: [[2, 2]] }]);
      const report = await scanRepository(db, root, { config, changed });
      expect(report.mode).toBe('diff');
      expect(report.findings.map((f) => f.kind)).toEqual(['wrong-arguments']);
      expect(report.skipped).toEqual(['type errors: types.enabled is off']);
    } finally { db.close(); }
  });
});

describe('gw scan on a diff with context', () => {
  it('ignores defects on context lines and in symbols the diff does not touch', async () => {
    const root = fixture();
    const { config, db } = await open(root);
    config.types.enabled = false;
    try {
      // Line 3 of use.ts is added; lines 1 and 2, which hold existing defects, are context.
      const context = changedFromDiff('--- a/use.ts\n+++ b/use.ts\n@@ -1,2 +1,3 @@\n import { total, missing } from "./lists.js";\n export const sum = total(1);\n+export const other = missing;\n');
      expect(context).toEqual([{ file: 'use.ts', ranges: [[3, 3]] }]);
      expect((await scanRepository(db, root, { config, changed: context })).findings).toEqual([]);
      expect(changedFromDiff('--- a/use.ts\n+++ b/use.ts\n@@ -1,3 +1,2 @@\n import { total, missing } from "./lists.js";\n-export const sum = total(1);\n export const other = missing;\n')).toEqual([]);
      // Only the last line of lists.ts changes: its duplicated function, and the dead code in copy.ts, were there before.
      const tail = await scanRepository(db, root, { config, changed: [{ file: 'lists.ts', ranges: [[10, 10]] }] });
      expect(tail.findings.map((f) => `${f.kind} ${f.file}:${f.line}`)).toEqual(['duplicate-constant lists.ts:10']);
      // A diff that writes the copy reports it against the untouched original.
      const copy = await scanRepository(db, root, { config, changed: [{ file: 'copy.ts', ranges: [[1, 8]] }] });
      expect(copy.findings).toEqual([expect.objectContaining({ kind: 'duplicate-logic', file: 'copy.ts', suggestion: 'chunk (lists.ts:1)' })]);
    } finally { db.close(); }
  });
});

describe('gw scan command', () => {
  it('prints SARIF, exits 1 on a high-confidence finding and keeps its index out of git status', () => {
    const root = fixture();
    rmSync(path.join(root, '.gitignore'));
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-am', 'no ignore file');
    let out = '';
    try { execFileSync('npx', ['tsx', path.resolve('src/cli/main.ts'), 'scan', root, '--sarif'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (error) { const e = error as { status: number; stdout: string }; expect(e.status).toBe(1); out = e.stdout; }
    expect(JSON.parse(out).runs[0].results.length).toBeGreaterThan(3);
    expect(git(root, 'status', '--porcelain')).toBe('');
  });
});

describe('session receipt', () => {
  it('counts what hooks did without naming files or symbols', async () => {
    const root = fixture();
    const { config, db } = await open(root);
    try {
      writeFileSync(path.join(root, 'use.ts'), 'import { total } from "./lists.js";\nexport const sum = total(1, 2, 3);\n');
      await dispatch({ agent: 'claude', event: 'post_tool', sessionId: 's1', cwd: root, tool: 'Write', input: { file_path: path.join(root, 'use.ts') }, raw: {} } as never, root);
      updateLedger(root, 's1', (l) => { l.duplicatesPrevented += 2; });
      const receipt = await buildReceipt(db, root, 's1', config);
      expect(receipt).toMatchObject({ callsChecked: 2, inventedCallsCaught: 1, duplicatesPrevented: 2 });
      expect(receipt.addedMs).toBeGreaterThanOrEqual(0);
      const lines = receiptLines(receipt);
      expect(lines.join('\n')).not.toMatch(/use\.ts|total/);
      const png = textPng(lines);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      expect(inflateSync(png.subarray(41, png.length - 16)).length).toBe((width * 3 + 1) * height);
    } finally { db.close(); }
  });
});

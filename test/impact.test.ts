import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { changeImpact, renderImpact } from '../src/impact/index.js';
import { recordImpactEvidence } from '../src/impact/evidence.js';
import { impactStop } from '../src/impact/stop.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { stopEvent } from '../src/reuse/scenarios.js';
import { changeImpactTool } from '../src/mcp/tools/change_impact.js';

const roots: string[] = [];
const config = () => { const c = defaultConfig(); c.impact.timeoutMs = 10000; return c; };
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-impact-')); roots.push(root);
  mkdirSync(path.join(root, 'test'));
  writeFileSync(path.join(root, '.gitignore'), '.groundwork/\n');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'vitest run' } }));
  writeFileSync(path.join(root, 'api.ts'), 'export function parse(value: string): string { return value; }\n');
  writeFileSync(path.join(root, 'caller.ts'), 'import { parse } from "./api.js";\nexport function caller() { return parse("a"); }\n');
  writeFileSync(path.join(root, 'test/api.test.ts'), 'import { caller } from "../caller.js";\nexport function check() { return caller(); }\n');
  git(root, 'init'); git(root, 'add', '.gitignore', 'package.json', 'api.ts', 'caller.ts', 'test/api.test.ts');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base');
  return root;
}
const edit = (root: string) => writeFileSync(path.join(root, 'api.ts'), 'export function parse(value: string, required: number): string { return value; }\n');
async function run(root: string, sessionId?: string, c = config(), refresh = true) {
  await initSqlBackend(); if (refresh) await refreshIndex(root, { config: c });
  const db = openDb(indexDbPath(root), { readonly: true });
  try { return await changeImpact(db, root, { config: c, sessionId }); } finally { db.close(); }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('change impact', () => {
  it('finds the planted unchanged caller and reaching tests with high risk and complete indexed evidence', async () => {
    const root = fixture(); edit(root);
    const report = await run(root);
    const changed = report.symbols.find((s) => s.name === 'parse')!;
    expect(changed).toMatchObject({ risk: 'high', signatureChanged: true, deleted: false });
    expect(changed.callers).toEqual(expect.arrayContaining([expect.objectContaining({ file: 'caller.ts', line: 2, confidence: 'import-resolved', lookedAt: false })]));
    expect(changed.tests).toEqual([{ file: 'test/api.test.ts', ran: false, command: "npx vitest run 'test/api.test.ts'" }]);
    expect(report.incompleteBecause).toEqual([]); expect(report.complete).toBe(true);
    expect(renderImpact(report, 2000)).toContain('no further lookup');
    expect(renderImpact(report, 40)).toContain('complete: false');
  });

  it('uses observed reads and test commands, not echo or absent session state, as coverage evidence', async () => {
    const root = fixture(); edit(root);
    const event = { ...stopEvent(root, false, 'impact-evidence'), event: 'post_tool' as const, cwd: root };
    recordImpactEvidence(root, { ...event, tool: 'Read', input: { file_path: 'caller.ts' }, response: { type: 'text', file: { filePath: 'caller.ts', numLines: 2 } } });
    recordImpactEvidence(root, { ...event, tool: 'Bash', input: { command: 'echo "npm test"' }, response: 'npm test' });
    expect((await run(root, 'impact-evidence')).symbols[0]!.tests[0]!.ran).toBe(false);
    recordImpactEvidence(root, { ...event, tool: 'Bash', input: { command: 'npx vitest run test/api.test.ts' }, response: 'passed' });
    const report = await run(root, 'impact-evidence');
    expect(report.evidenceKnown).toBe(true);
    expect(report.symbols[0]!.callers.find((c) => c.file === 'caller.ts')!.lookedAt).toBe(true);
    expect(report.symbols[0]!.tests[0]!.ran).toBe(true);
    expect((await run(root)).evidenceKnown).toBe(false);
  });

  it('returns incomplete for name-only calls, stale/unparsed files and depth truncation', async () => {
    const root = fixture(); edit(root);
    writeFileSync(path.join(root, 'ambiguous.ts'), 'export function other() { return unknown.parse("a"); }\n');
    const report = await run(root);
    expect(report.complete).toBe(false);
    expect(report.incompleteBecause).toContain('unresolved or name-only calls exist');
    unlinkSync(path.join(root, 'ambiguous.ts'));
    const c = config(); c.impact.depth = 1;
    expect((await run(root, undefined, c)).incompleteBecause.some((r) => r.includes('depth truncated'))).toBe(true);
    writeFileSync(path.join(root, 'broken.ts'), 'export function broken( {');
    expect((await run(root)).incompleteBecause).toContain('unparsed file: broken.ts');
    edit(root); writeFileSync(path.join(root, 'new.ts'), 'export const value = 1;');
    expect((await run(root, undefined, config(), false)).incompleteBecause).toContain('unindexed file: new.ts');
  });

  it('retains renamed and deleted symbols, including entirely deleted files', async () => {
    for (const mode of ['rename', 'delete'] as const) {
      const root = fixture();
      writeFileSync(path.join(root, 'caller.ts'), 'import { parse as aliased } from "./api.js";\nexport function caller() { return aliased("a"); }\n');
      git(root, 'add', 'caller.ts'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Alias caller');
      if (mode === 'delete') unlinkSync(path.join(root, 'api.ts'));
      else writeFileSync(path.join(root, 'api.ts'), 'export function renamed(value: string): string { return value; }\n');
      const report = await run(root);
      expect(report.symbols).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'parse', deleted: true, risk: 'high', callers: expect.arrayContaining([expect.objectContaining({ file: 'caller.ts' })]) })]));
      expect(report.symbols.find((s) => s.name === 'parse')!.tests).toEqual(expect.arrayContaining([expect.objectContaining({ file: 'test/api.test.ts' })]));
    }
  });

  it('adds one Stop context line per impact set, never blocks even strict, and fails open', async () => {
    const root = fixture(), c = config(); c.profile = 'strict';
    expect(await impactStop.run(stopEvent(root, false, 'impact-stop'), { root, config: c })).toBeNull();
    edit(root);
    const event = stopEvent(root, false, 'impact-stop');
    const first = await impactStop.run(event, { root, config: c });
    expect(first).toMatchObject({ action: 'context' });
    expect(first?.message).toContain('Groundwork impact: parse signature changed');
    expect(first?.message).toContain('caller.ts:2'); expect(first?.message).toContain('test/api.test.ts');
    expect(await impactStop.run(event, { root, config: c })).toBeNull();
    c.impact.timeoutMs = 1;
    expect(await impactStop.run(event, { root, config: c })).toBeNull();
  }, 30000);

  it('exposes JSON CLI and one budgeted MCP tool, and reports empty/error cases honestly', async () => {
    const root = fixture();
    expect((await run(root)).symbols).toEqual([]);
    edit(root); const c = config(); await run(root);
    const cli = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'src/cli/program.ts', '--root', root, 'impact', '--json'], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(cli.symbols[0]).toMatchObject({ name: 'parse', risk: 'high' });
    const db = openDb(indexDbPath(root), { readonly: true });
    try {
      expect(await changeImpactTool.handler({}, { root, db, config: c })).toContain('caller.ts:2');
      const bad = await changeImpact(db, root, { base: 'does-not-exist', config: c });
      expect(bad.complete).toBe(false); expect(bad.incompleteBecause.length).toBeGreaterThan(0);
    } finally { db.close(); }
  }, 30000);
});

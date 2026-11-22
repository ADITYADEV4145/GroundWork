import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { changeImpact, renderImpact } from '../src/impact/index.js';
import { recordImpactEvidence } from '../src/impact/evidence.js';
import { sessionEvidence } from '../src/impact/evidence.js';
import { shellQuote } from '../src/guards/trimmer.js';
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
  it('does not claim file-level test coverage for runner name or marker filters', () => {
    const root = fixture();
    for (const filter of ['-k smoke', '-m slow', '-t case', '--testNamePattern=case', '--grep case']) {
      const runner = filter.startsWith('-k') || filter.startsWith('-m') ? 'pytest' : 'vitest run';
      const session = filter.replace(/[^A-Za-z0-9_-]/g, '_');
      recordImpactEvidence(root, { ...stopEvent(root, false, session), event: 'post_tool', tool: 'Bash', input: { command: `${runner} ${filter} test` }, response: 'passed' });
      expect(sessionEvidence(root, session).ran('test/api.test.ts')).toBe(false);
    }
  });
  it('restricts observed test discovery to runner directory and root options', () => {
    const root = fixture();
    for (const option of ['--dir', '--root', '--rootdir']) {
      const command = `${option === '--rootdir' ? 'pytest' : 'vitest run'} ${option}=test/unit`;
      recordImpactEvidence(root, { ...stopEvent(root, false, option), event: 'post_tool', tool: 'Bash', input: { command }, response: 'passed' });
      const evidence = sessionEvidence(root, option);
      expect(evidence.ran('test/api.test.ts')).toBe(false);
      expect(evidence.ran('test/unit/example.test.ts')).toBe(true);
    }
  });
  it('separates runner options, positional selectors and excluded test paths', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run --coverage --config vitest.config.ts --project unit' } }));
    const record = (session: string, command: string) => recordImpactEvidence(root, { ...stopEvent(root, false, session), event: 'post_tool', tool: 'Bash', input: { command }, response: 'passed' });
    record('coverage', 'npm test');
    expect(sessionEvidence(root, 'coverage').ran('test/api.test.ts')).toBe(true);
    record('ignored', 'pytest --ignore tests/unit tests/integration');
    expect(sessionEvidence(root, 'ignored').ran('tests/unit/test_api.py')).toBe(false);
    expect(sessionEvidence(root, 'ignored').ran('tests/integration/test_api.py')).toBe(true);
    record('deselected', 'pytest --deselect=tests/unit/test_api.py --config pytest.ini tests');
    expect(sessionEvidence(root, 'deselected').ran('tests/unit/test_api.py')).toBe(false);
    expect(sessionEvidence(root, 'deselected').ran('tests/integration/test_api.py')).toBe(true);
    record('config', 'vitest run --config test/api.test.ts --project integration test/other.test.ts');
    expect(sessionEvidence(root, 'config').ran('test/api.test.ts')).toBe(false);
    expect(sessionEvidence(root, 'config').ran('test/other.test.ts')).toBe(true);
  });
  it('does not rate private or protected method signature changes as public high risk', async () => {
    for (const visibility of ['private', 'protected', 'public']) {
      const root = fixture();
      const source = `export class Service { ${visibility} parse(value: string): string { return value; } }\n`;
      writeFileSync(path.join(root, 'api.ts'), source);
      writeFileSync(path.join(root, 'caller.ts'), 'import { Service } from "./api.js";\nexport function caller() { return new Service().parse("a"); }\n');
      git(root, 'add', 'api.ts', 'caller.ts'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Method visibility');
      writeFileSync(path.join(root, 'api.ts'), source.replace('value: string)', 'value: string, required: number)'));
      const method = (await run(root)).symbols.find((s) => s.name === 'Service.parse');
      expect(method?.risk).toBe(visibility === 'public' ? 'high' : 'medium');
    }
  });
  it('respects package test script selectors rather than marking every test run', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run test/unit' } }));
    recordImpactEvidence(root, { ...stopEvent(root, false, 'selected'), event: 'post_tool', tool: 'Bash', input: { command: 'npm test' }, response: 'passed' });
    const evidence = sessionEvidence(root, 'selected');
    expect(evidence.ran('test/api.test.ts')).toBe(false);
    expect(evidence.ran('test/unit/example.test.ts')).toBe(true);
    expect(evidence.ran('test/unit-other/example.test.ts')).toBe(false);
  });
  it('records test commands rewritten by the output-trimming wrapper', () => {
    const root = fixture();
    const command = `GW_SESSION_ID='wrapped' GW_ROOT=${shellQuote(root)} '/usr/bin/node' '--import' '/package/node_modules/tsx/dist/loader.mjs' '/package/src/cli/main.ts' run -- ${shellQuote("npx vitest run 'test/api.test.ts'")}`;
    recordImpactEvidence(root, { ...stopEvent(root, false, 'wrapped'), event: 'post_tool', tool: 'Bash', input: { command }, response: 'passed' });
    expect(sessionEvidence(root, 'wrapped').ran('test/api.test.ts')).toBe(true);
    expect(sessionEvidence(root, 'wrapped').ran('test/other.test.ts')).toBe(false);
  });
  it('reports importers broken by an export-alias-only rename or removal', async () => {
    for (const replacement of ['export { local as renamed };', 'export {};']) {
      const root = fixture();
      const declaration = 'function local(value: string): string { return value; }\n';
      writeFileSync(path.join(root, 'api.ts'), declaration + 'export { local as parse };\n');
      git(root, 'add', 'api.ts'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Export alias');
      writeFileSync(path.join(root, 'api.ts'), declaration + replacement + '\n');
      const report = await run(root);
      expect(report.symbols).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'local', signatureChanged: true, risk: 'high', callers: expect.arrayContaining([expect.objectContaining({ file: 'caller.ts' })]) })]));
      expect(report.complete).toBe(false);
    }
  });
  it('finds aliased default-import callers after deleting a default export', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'api.ts'), 'export default function parse(value: string): string { return value; }\n');
    writeFileSync(path.join(root, 'caller.ts'), 'import renamed from "./api.js";\nexport function caller() { return renamed("a"); }\n');
    git(root, 'add', 'api.ts', 'caller.ts'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Default export');
    writeFileSync(path.join(root, 'api.ts'), 'export {};\n');
    expect((await run(root)).symbols).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'parse', deleted: true, risk: 'high', callers: expect.arrayContaining([expect.objectContaining({ file: 'caller.ts' })]) })]));
  });
  it('selects a function after a deletion-only body edit', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'api.ts'), 'export function parse(value: string): string {\n  const unused = 1;\n  return value;\n}\n');
    git(root, 'add', 'api.ts'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Multiline body');
    writeFileSync(path.join(root, 'api.ts'), 'export function parse(value: string): string {\n  return value;\n}\n');
    expect((await run(root)).symbols).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'parse', risk: 'medium' })]));
  });
  it('ignores unrelated unresolved calls, imports, unparsed and dynamic files', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'unrelated.ts'), 'import { absent } from "./missing.js";\nexport function unrelated() { Object.assign({}, {}); return unknown.other(); }\n');
    writeFileSync(path.join(root, 'broken.ts'), 'export function broken( {');
    git(root, 'add', 'unrelated.ts', 'broken.ts'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Unrelated ambiguity');
    edit(root);
    const report = await run(root);
    expect(report.complete).toBe(true); expect(report.incompleteBecause).toEqual([]);
  });

  it('keeps name-only ambiguity for a traversed caller and unresolved imports in reached files', async () => {
    const root = fixture(); edit(root);
    writeFileSync(path.join(root, 'ambiguous.ts'), 'export function other() { return unknown.caller(); }\n');
    expect((await run(root)).incompleteBecause).toContain('unresolved or name-only calls exist');
    unlinkSync(path.join(root, 'ambiguous.ts'));
    writeFileSync(path.join(root, 'caller.ts'), 'import { parse } from "./api.js";\nimport { missing } from "./missing.js";\nexport function caller() { return parse("a"); }\n');
    expect((await run(root)).incompleteBecause).toContain('unresolved local imports exist');
  });

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

  it('resolves the source Stop worker tsx loader from the package when launched outside it', () => {
    const root = fixture(); edit(root);
    const script = `import { impactStop } from ${JSON.stringify(new URL('../src/impact/stop.ts', import.meta.url).href)};
      import { defaultConfig } from ${JSON.stringify(new URL('../src/config/load.ts', import.meta.url).href)};
      const root = process.cwd(), config = defaultConfig(); config.impact.timeoutMs = 10000;
      console.log(JSON.stringify(await impactStop.run(${JSON.stringify(stopEvent(root, false, 'foreign-source'))}, { root, config })));`;
    const result = JSON.parse(execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', timeout: 20000 }));
    expect(result).toMatchObject({ action: 'context' });
    expect(result.message).toContain('caller.ts:2');
  }, 30000);
});

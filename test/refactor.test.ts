import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withIndex } from '../src/cli/context.js';
import { refactorSymbolTool } from '../src/mcp/tools/refactor_symbol.js';
import { refactorSymbol, type RefactorResult } from '../src/refactor/index.js';
import type { RefactorRequest } from '../src/refactor/project.js';
import { tempDir } from '../src/selftest/fixtures.js';

let root: string;
const put = (file: string, value: string) => writeFileSync(path.join(root, file), value);
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const refactor = (request: RefactorRequest, id?: string) => withIndex({ root }, (ctx) => refactorSymbol(ctx, request, id));

describe('guarded symbol refactoring', () => {
  beforeEach(() => {
    root = tempDir('gw-refactor-test-');
    git('init', '-q');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('renames imported and re-exported bindings, preserving aliases, strings, comments and same-named locals', async () => {
    put('tsconfig.json', JSON.stringify({ files: ['math.ts'] }));
    put('math.ts', 'export function total(n: number) { return n + 2; }\n');
    put('index.ts', "export { total as publicTotal } from './math.js';\n");
    put('direct.ts', "import { total } from './math.js';\nexport const value = total(3);\n");
    put('use.ts', [
      "import { total as calculate } from './math.js';",
      "import { publicTotal } from './index.js';",
      'export function test() { const total = 1; return calculate(total) + publicTotal(total); }',
      'export const text = "total"; // total',
      '',
    ].join('\n'));
    git('add', 'math.ts', 'index.ts', 'use.ts');
    const request = { symbol: 'math.ts:total', name: 'sum' };
    const preview = await refactor(request);
    expect(preview).toMatchObject({ applied: false, check: { status: 'PASS' } });
    expect(preview.patch).toContain('export { sum as publicTotal }');
    expect(read('math.ts')).toContain('function total');
    expect(await refactor(request, preview.id)).toMatchObject({ applied: true });
    expect(read('index.ts')).toContain('sum as publicTotal');
    expect(read('use.ts')).toContain('sum as calculate');
    expect(read('direct.ts')).toContain('value = sum(3)');
    expect(read('use.ts')).toContain('const total = 1');
    expect(read('use.ts')).toContain('"total"; // total');
    expect(git('show', ':math.ts')).toContain('function total');
  });

  it('expands shorthand safely and refuses a rename that would capture a reference', async () => {
    put('math.ts', [
      'export function outer() {',
      '  function keep(n: number) { return n; }',
      '  return { keep, inner() { const capture = (n: number) => n; return keep(capture(1)); } };',
      '}',
    ].join('\n'));
    const request = { symbol: 'math.ts:outer.keep', name: 'retain' };
    const preview = await refactor(request);
    expect(preview.patch).toContain('keep: retain');
    expect(preview.patch).toContain('return retain(capture(1))');
    await expect(refactor({ ...request, name: 'capture' })).rejects.toThrow(/bindings|capture/);
    expect(read('math.ts')).toContain('return { keep,');
  });

  it('replaces only one JS function body and requires a fresh, exact preview through the CLI', async () => {
    const source = 'export const café = (n) => n * 3;\nexport const other = () => 17;\n';
    put('file space.js', source);
    put('body.txt', 'n * 7');
    const main = path.resolve(__dirname, '../src/cli/main.ts');
    const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), main,
      '--root', root, '--json', 'refactor', 'file space.js:café', '--body-file', path.join(root, 'body.txt'), ...args],
    { encoding: 'utf8' });
    const output = cli();
    expect(output.status, output.stdout + output.stderr).toBe(0);
    const preview = JSON.parse(output.stdout) as RefactorResult;
    expect(preview.patch).toContain('=> n * 7;');
    expect(read('file space.js')).toBe(source);
    put('file space.js', source + '\n// Unrelated dirty edit\n');
    const stale = cli('--apply', preview.id);
    expect(stale.status).toBe(1);
    expect(JSON.parse(stale.stdout).error).toContain('no longer matches');
    expect(read('file space.js')).toContain('=> n * 3;');
    const current = JSON.parse(cli().stdout) as RefactorResult;
    const result = cli('--apply', current.id);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(read('file space.js')).toBe(source.replace('* 3', '* 7') + '\n// Unrelated dirty edit\n');
  });

  it('refuses ambiguous symbols, syntax escapes, introduced errors in callers, and generated files', async () => {
    put('first.ts', 'export function calc() { return 4; }\n');
    put('second.ts', 'export function calc(a: number) { return a * 2; }\n');
    put('caller.ts', "import { calc } from './first.js';\nexport const use: number = calc();\n");
    put('generated.ts', '// @generated\nexport function target() { return 1; }\n');
    await expect(refactor({ symbol: 'calc', name: 'next' })).rejects.toThrow('Ambiguous');
    await expect(refactor({ symbol: 'first.ts:calc', body: '{ return 4; } export const injected = 3;' })).rejects.toThrow('exactly one function body');
    await expect(refactor({ symbol: 'first.ts:calc', body: '{ return "bad"; }' })).rejects.toThrow('caller.ts');
    await expect(refactor({ symbol: 'first.ts:calc', body: '{ return z; }' })).rejects.toThrow(/TS2304/);
    await expect(refactor({ symbol: 'target', name: 'next' })).rejects.toThrow('No exact indexed symbol');
    expect(read('first.ts')).toBe('export function calc() { return 4; }\n');
  });

  it('edits a qualified method independently of same-named methods and preserves CRLF', async () => {
    const source = [
      'export class First { work() { return "first"; } }',
      'export class Second { work() { return "second"; } }',
      '',
    ].join('\r\n');
    put('classes.ts', source);
    await expect(refactor({ symbol: 'classes.ts:work', body: '{ return "changed"; }' })).rejects.toThrow('Ambiguous');
    const request = { symbol: 'classes.ts:First.work', body: '{ return "changed"; }' };
    const preview = await refactor(request);
    expect(await refactor(request, preview.id)).toMatchObject({ applied: true });
    expect(read('classes.ts')).toBe(source.replace('"first"', '"changed"'));
  });

  it('refuses incomplete cross-config renames and references in uneditable files', async () => {
    put('tsconfig.json', JSON.stringify({ files: ['first.ts'] }));
    put('first.ts', 'export function calc() { return 4; }\n');
    mkdirSync(path.join(root, 'other'));
    put('other/tsconfig.json', JSON.stringify({ files: ['consumer.ts'] }));
    put('other/consumer.ts', "import { calc } from '../first.js';\nexport const result = calc();\n");
    await expect(refactor({ symbol: 'calc', name: 'next' })).rejects.toThrow('outside the compiler project');
    rmSync(path.join(root, 'tsconfig.json'));
    mkdirSync(path.join(root, '.groundwork'), { recursive: true });
    put('.groundwork/config.json', JSON.stringify({ index: { exclude: ['other/consumer.ts'] } }));
    await expect(refactor({ symbol: 'calc', name: 'next' })).rejects.toThrow('Not an editable');
  });

  it('preserves the callable type when another compiler project can use it', async () => {
    put('tsconfig.json', JSON.stringify({ files: ['calc.ts'] }));
    put('calc.ts', 'export function calc() { return 4; }\n');
    mkdirSync(path.join(root, 'other'));
    put('other/tsconfig.json', JSON.stringify({ files: ['consumer.ts'] }));
    put('other/consumer.ts', "import { calc } from '../calc.js';\nexport const result: number = calc();\n");
    await expect(refactor({ symbol: 'calc', body: '{ return "bad"; }' })).rejects.toThrow('outside the compiler project');
    expect(await refactor({ symbol: 'calc', body: '{ return 8; }' })).toMatchObject({ check: { status: 'PASS' } });
  });

  it.skipIf(process.platform === 'win32')('refuses to edit a symlink even when it resolves inside the repository', async () => {
    put('source.ts', 'export const operation = () => 1;\n');
    symlinkSync('source.ts', path.join(root, 'link.ts'));
    await expect(refactor({ symbol: 'link.ts:operation', name: 'next' })).rejects.toThrow('Not an editable');
    expect(read('source.ts')).toContain('operation');
  });

  it('uses the reuse gate on proposed bodies, leaving source and index staging untouched when blocked', async () => {
    const duplicate = '{ const items: number[] = []; for (const n of values) { if (n > 30) items.push(n * 17 + 38); } return items.reverse(); }';
    put('existing.ts', `export function transform(values: number[]) ${duplicate}\n`);
    const source = 'export function recent(values: number[]) { return values; }\n';
    put('new.ts', source);
    const request = { symbol: 'recent', body: duplicate };
    const preview = await refactor(request);
    expect(preview.check.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'duplicate', severity: 'BLOCK' })]));
    expect(await refactor(request, preview.id)).toMatchObject({ applied: false });
    expect(read('new.ts')).toBe(source);
    expect(git('diff', '--cached', '--name-only')).toBe('');
  });

  it('runs indexed grounding even when compiler diagnostics are disabled for a file', async () => {
    put('math.ts', 'export function known(n: number) { return n; }\n');
    const source = "// @ts-nocheck\nimport { known } from './math.js';\nexport function edit() { return known(1); }\n";
    put('edit.ts', source);
    const result = await refactor({ symbol: 'edit', body: '{ return known(1, 2, 3); }' });
    expect(result.check.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'grounding', severity: 'BLOCK', grounding: expect.objectContaining({ kind: 'arity' }) }),
    ]));
    expect(read('edit.ts')).toBe(source);
  });

  it('blocks an unresolved CommonJS importer the compiler left outside the patch', async () => {
    put('math.ts', 'export function total(n: number) { return n + 1; }\n');
    put('use.ts', 'const { total } = require("./math.js");\nexport const use = () => total(2);\n');
    const request = { symbol: 'total', name: 'sum' };
    const result = await refactor(request);
    expect(result.check.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'grounding', severity: 'BLOCK', grounding: expect.objectContaining({ file: 'use.ts', kind: 'unknown-export' }) }),
    ]));
    expect(await refactor(request, result.id)).toMatchObject({ applied: false });
    expect(read('math.ts')).toContain('function total');
  });

  it('does not excuse a new bad call that matches an untouched finding', async () => {
    put('math.ts', 'export function known(n: number) { return n; }\n');
    const source = [
      '// @ts-nocheck',
      'import { known } from "./math.js";',
      'export function old() {',
      '  return known(1, 2);',
      '}',
      'export function next() { return 1; }',
      '',
    ].join('\n');
    put('edit.ts', source);
    const request = { symbol: 'next', body: '{\n  return known(1, 2);\n}' };
    const result = await refactor(request);
    expect(result.check.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'grounding', severity: 'BLOCK', grounding: expect.objectContaining({ kind: 'arity', line: 7 }) }),
    ]));
    expect(await refactor(request, result.id)).toMatchObject({ applied: false });
    expect(read('edit.ts')).toBe(source);
  });

  it('offers the same preview ID through MCP without mutating source', async () => {
    const source = 'export const ready = () => true;\n';
    put('a.ts', source);
    const preview = await refactor({ symbol: 'ready', name: 'loaded' });
    const text = await withIndex({ root }, (ctx) => refactorSymbolTool.handler({ symbol: 'ready', name: 'loaded' }, ctx));
    expect(text).toContain(preview.id);
    expect(text).toContain('no files changed');
    expect(read('a.ts')).toBe(source);
  });
});

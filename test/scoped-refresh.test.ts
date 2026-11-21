import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { discoverFiles } from '../src/index/discover.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initParsersFor, parse } from '../src/lang/parser.js';
import { canonicalDump } from '../src/selftest/dump.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { prng, randomEdit, synthRepo } from '../src/selftest/synth.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

const dirs: string[] = [];
const directory = () => { const dir = tempDir('gw-scoped-test-'); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const dump = (root: string) => {
  const db = openDb(indexDbPath(root), { readonly: true });
  try { return canonicalDump(db); } finally { db.close(); }
};
const write = (root: string, file: string, content: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
};

describe('scoped refresh', () => {
  it('discovers exact non-Git paths without traversing siblings or symlinked directories', () => {
    const root = directory(), outside = directory(), config = defaultConfig();
    write(root, '.gitignore', 'ignored/\n');
    write(root, 'src/a.ts', 'export const a = 1;');
    write(root, 'src/b.ts', 'export const b = 2;');
    write(root, 'ignored/no.ts', 'export const no = 0;');
    write(root, 'node_modules/no.ts', 'export const no = 0;');
    write(outside, 'outside.ts', 'export const outside = 0;');
    symlinkSync(path.join(root, 'src'), path.join(root, 'alias'), 'dir');
    symlinkSync(path.join(outside, 'outside.ts'), path.join(root, 'escape.ts'));
    symlinkSync(path.join(root, 'src/a.ts'), path.join(root, 'local.ts'));
    const paths = ['src/a.ts', 'local.ts', 'ignored/no.ts', 'node_modules/no.ts', 'missing.ts', 'src/a.ts/invalid.ts', 'alias/a.ts', 'escape.ts'];
    expect(discoverFiles(root, config, paths)).toEqual(discoverFiles(root, config).filter((file) => paths.includes(file)));
    expect(discoverFiles(root, config, paths)).toEqual(['local.ts', 'src/a.ts']);
    expect(discoverFiles(root, config, [])).toEqual([]);
    expect(discoverFiles(root, config, ['../outside.ts', path.join(outside, 'outside.ts')])).toEqual([]);
  });
  it('matches full rebuilds across re-exports, global ambiguity, signature edits, deletions and resolver changes', async () => {
    await initSqlBackend();
    const root = directory();
    write(root, 'lib.ts', 'export function real(a: number) { return a; }\nexport function globalOnly() {}\n');
    write(root, 'barrel.ts', "export { real as alias } from './lib';\n");
    write(root, 'use.ts', "import { alias as invoke } from './barrel';\ninvoke(1);\nglobalOnly();\n");
    write(root, 'other.ts', 'export const value = 1;\n');
    await refreshIndex(root);
    const compare = async (paths: string[]) => {
      await refreshIndex(root, { paths });
      const incremental = dump(root);
      await refreshIndex(root, { full: true });
      expect(incremental).toBe(dump(root));
    };
    write(root, 'lib.ts', 'export function real(a: number, b: number) { return a + b; }\nexport function globalOnly() {}\n');
    await compare(['lib.ts']);
    write(root, 'other.ts', 'export function globalOnly() {}\n');
    await compare(['other.ts']);
    write(root, 'lib.ts', 'export function replacement() {}\n');
    await compare(['lib.ts']);
    write(root, 'barrel.ts', "export { replacement as alias } from './lib';\n");
    await compare(['barrel.ts']);
    rmSync(path.join(root, 'other.ts'));
    await compare(['other.ts']);
    write(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } }));
    await compare([]);
  });

  it('honors ignored and excluded paths and fully rebuilds a stale index', async () => {
    await initSqlBackend();
    const root = directory();
    write(root, '.gitignore', 'ignored/\n');
    write(root, 'src/a.ts', 'export function a() {}\n');
    write(root, 'pkg/b.py', 'def b():\n    return 1\n');
    write(root, 'ignored/no.ts', 'export function no() {}\n');
    const first = await refreshIndex(root, { paths: ['src/a.ts'] });
    expect(first.files).toBe(2);
    expect((await refreshIndex(root, { paths: ['ignored/no.ts'] })).files).toBe(0);
    const config = defaultConfig();
    config.index.exclude = ['src/**'];
    const rebuilt = await refreshIndex(root, { config, paths: ['src/a.ts'] });
    expect(rebuilt.rebuilt).toBe(true);
    expect(rebuilt.files).toBe(1);
    expect(dump(root)).toContain('pkg/b.py');
  });

  it('matches full rebuilds after mixed scoped TS/Python edit sequences', async () => {
    await initSqlBackend();
    const root = directory(), config = defaultConfig(), rnd = prng(17);
    synthRepo(root, 600, 7);
    await Promise.all([refreshIndex(root), refreshIndex(root)]);
    const snapshot = () => new Map(discoverFiles(root, config).map((file) => [file, readFileSync(path.join(root, file), 'utf8')]));
    for (let i = 0; i < 30; i++) {
      const before = snapshot();
      randomEdit(root, rnd);
      const after = snapshot();
      const paths = [...new Set([...before.keys(), ...after.keys()])].filter((file) => before.get(file) !== after.get(file));
      await refreshIndex(root, { paths });
      const incremental = dump(root);
      await refreshIndex(root, { full: true });
      expect(incremental).toBe(dump(root));
    }
  });

  it('loads additional grammars on demand without losing earlier parsers', async () => {
    await initParsersFor(['typescript']);
    const ts = parse('typescript', 'export const a = 1;');
    expect(ts.rootNode.hasError).toBe(false);
    ts.delete();
    await initParsersFor(['python']);
    const py = parse('python', 'def a():\n    return 1\n');
    expect(py.rootNode.hasError).toBe(false);
    py.delete();
    await initParsersFor([]);
    const again = parse('typescript', 'const b = 2;');
    expect(again.rootNode.hasError).toBe(false);
    again.delete();
  });
});

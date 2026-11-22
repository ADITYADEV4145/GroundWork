import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { typeCheck, renderTypes, typeNavigate } from '../src/types/index.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { verifyChanged } from '../src/grounding/index.js';
import { checkRepository } from '../src/reuse/check.js';
import { duplicateGate } from '../src/hooks/handlers/duplicate_gate.js';
import { stopEvent } from '../src/reuse/scenarios.js';

const directories: string[] = [];
function fixture(compiler = true, file = 'app.ts', source = 'export {};\n') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-types-test-')); directories.push(root);
  writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: true }, include: ['*.ts'] }));
  if (compiler) { mkdirSync(path.join(root, 'node_modules')); symlinkSync(path.resolve('node_modules/typescript'), path.join(root, 'node_modules/typescript'), 'dir'); }
  writeFileSync(path.join(root, file), source);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init'); git('add', file, 'package.json', 'tsconfig.json');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base');
  return root;
}
afterEach(() => { for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true }); });
const config = () => { const c = defaultConfig(); c.types.timeoutMs = 20000; return c; };

describe('optional project types', () => {
  it('safely skips Go, Rust, Java, C# and Ruby files', async () => {
    const root = fixture(false);
    const files = ['app.go', 'app.rs', 'App.java', 'App.cs', 'app.rb'];
    for (const file of files) writeFileSync(path.join(root, file), 'unsupported compiler input');
    expect(await typeCheck(root, files.map((file) => ({ file, ranges: null })), config())).toEqual({
      available: { typescript: false, python: false }, findings: [], timedOut: false,
    });
  });
  it('keeps informational type diagnostics out of Stop, including mixed reports', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'app.ts'), 'function identity(value) { return value; }\n');
    const c = config(); c.reuse.duplicateGate = false;
    const report = await checkRepository(root, { config: c });
    expect(report.types?.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 7006, blocking: false })]));
    expect(renderTypes(report.types!, 1000)).toContain('7006');
    for (const profile of ['standard', 'strict'] as const) {
      c.profile = profile;
      expect(await duplicateGate.run(stopEvent(root, false, profile), { root, config: c })).toMatchObject({ action: 'allow' });
    }
    writeFileSync(path.join(root, 'app.ts'), 'function identity(value) { return value; }\nfunction count(n: number) { return n; }\ncount("wrong");\n');
    const mixed = await duplicateGate.run(stopEvent(root, false, 'mixed-types'), { root, config: c });
    expect(mixed).toMatchObject({ action: 'deny' });
    expect(mixed?.message).toContain('Argument of type');
    expect(mixed?.message).not.toContain('implicitly');
  }, 60000);
  it('includes new type errors in check and strict Stop, reports standard context, and respects stopGate', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'app.ts'), 'function count(n: number) { return n; }\ncount("wrong");\n');
    const c = config(); c.profile = 'strict';
    const report = await checkRepository(root, { config: c });
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'BLOCK', grounding: expect.objectContaining({ kind: 'type', line: 2 }) })]));
    expect(await duplicateGate.run(stopEvent(root, false, 'strict-types'), { root, config: c })).toMatchObject({ action: 'deny' });
    c.profile = 'standard';
    expect(await duplicateGate.run(stopEvent(root, false, 'standard-types'), { root, config: c })).toMatchObject({ action: 'context' });
    c.types.stopGate = false;
    expect((await checkRepository(root, { config: c, stopHook: true })).findings.some((f) => f.grounding?.kind === 'type')).toBe(false);
  }, 60000);
  it('catches typed returns, interface parameters and wrong argument types beyond grounding', async () => {
    const root = fixture();
    const source = 'interface User { name: string }\nfunction user(): User { return {name: "a"}; }\nuser().missing();\nfunction greet(u: User) { return u.wrong; }\nfunction count(n: number) { return n; }\ncount("wrong");\ncount();\nunknownName();\n';
    writeFileSync(path.join(root, 'app.ts'), source);
    const changed = [{ file: 'app.ts', ranges: null }];
    const result = await typeCheck(root, changed, config());
    expect(result.available.typescript).toBe(true);
    expect(result.findings.filter((f) => f.blocking).map((f) => f.code)).toEqual(expect.arrayContaining([2339, 2345, 2554, 2304]));
    await initSqlBackend(); await refreshIndex(root);
    const db = openDb(indexDbPath(root), { readonly: true });
    try {
      const grounding = verifyChanged(db, root, changed).flatMap((r) => r.findings);
      expect(grounding.some((f) => f.line === 6)).toBe(false);
      expect(result.findings.some((f) => f.line === 6 && f.blocking)).toBe(true);
    } finally { db.close(); }
    const filtered = await typeCheck(root, [{ file: 'app.ts', ranges: [[6, 6]] }], config());
    expect(filtered.findings.map((f) => f.line)).toEqual([6]);
    writeFileSync(path.join(root, 'app.ts'), 'export const clean: number = 1;\n');
    const clean = await typeCheck(root, changed, config());
    expect(clean.findings).toEqual([]);
    expect(renderTypes(clean, 400)).toBe('');
  }, 60000);

  it('does not block pre-existing diagnostics moved to changed lines', async () => {
    const source = 'export const value: {name: string} = {name: "a"};\nvalue.missing();\n';
    const root = fixture(true, 'app.ts', source);
    writeFileSync(path.join(root, 'app.ts'), `\n\n${source}`);
    const result = await typeCheck(root, [{ file: 'app.ts', ranges: null }], config());
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 2339, blocking: false, preExisting: true })]));
  }, 30000);

  it('blocks a new occurrence of an error that already exists in the file', async () => {
    const source = 'export const value: {name: string} = {name: "a"};\nvalue.missing();\n';
    const root = fixture(true, 'app.ts', source);
    writeFileSync(path.join(root, 'app.ts'), `${source}value.missing();\n`);
    const result = await typeCheck(root, [{ file: 'app.ts', ranges: [[3, 3]] }], config());
    expect(result.findings).toEqual([expect.objectContaining({ code: 2339, line: 3, blocking: true })]);
  }, 30000);

  it('baselines against base versions of changed dependencies', async () => {
    const root = fixture(true, 'app.ts', 'import { f } from "./lib.js";\nf(1);\n');
    writeFileSync(path.join(root, 'lib.ts'), 'export function f(a: number) { return a; }\n');
    execFileSync('git', ['add', 'lib.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'lib'], { cwd: root });
    writeFileSync(path.join(root, 'lib.ts'), 'export function f(a: number, b: number) { return a + b; }\n');
    writeFileSync(path.join(root, 'app.ts'), 'import { f } from "./lib.js";\nf(1);\nf(2);\n');
    const result = await typeCheck(root, [{ file: 'lib.ts', ranges: null }, { file: 'app.ts', ranges: [[3, 3]] }], config());
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ file: 'app.ts', code: 2554, line: 3, blocking: true })]));
  }, 30000);

  it('keeps type-confirmed grounding errors in a types-only strict Stop', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'app.ts'), 'unknownName();\n');
    const c = config(); c.reuse.duplicateGate = false; c.profile = 'strict';
    const result = await duplicateGate.run(stopEvent(root, false, 'confirmed-types'), { root, config: c });
    expect(result).toMatchObject({ action: 'deny' });
    expect(result?.message).toContain('unknownName');
  }, 60000);

  it('keeps baseline-exempt grounding errors out of a types-only strict Stop', async () => {
    const root = fixture(true, 'app.ts', 'function count(n: number) { return n; }\ncount();\n');
    writeFileSync(path.join(root, 'app.ts'), 'function count(n: number) { return n; }\ncount(); // touched\n');
    const c = config(); c.reuse.duplicateGate = false; c.profile = 'strict';
    const r = await duplicateGate.run(stopEvent(root, false, 'baseline-types'), { root, config: c });
    expect(r).toMatchObject({ action: 'allow' });
  }, 60000);

  it('resolves explicit gw types check paths from the current directory', () => {
    const root = fixture(true, 'app.ts', 'export {};\n');
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: true }, include: ['**/*.ts'] }));
    writeFileSync(path.join(root, 'sub', 'app.ts'), 'const n: number = 1;\nn.missing();\n');
    const run = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.resolve('src/cli/main.ts'), 'types', 'check', 'app.ts', '--json'], { cwd: path.join(root, 'sub'), encoding: 'utf8' });
    expect(JSON.parse(run.stdout).findings).toEqual(expect.arrayContaining([expect.objectContaining({ file: path.join('sub', 'app.ts'), code: 2339 })]));
  }, 60000);

  it('leaves all missing modules to grounding and keeps other non-allowlisted diagnostics informational', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'app.ts'), 'import x from "not-installed";\nimport y from "./missing.js";\nconst n: number = "wrong";\n');
    const result = await typeCheck(root, [{ file: 'app.ts', ranges: null }], config());
    expect(result.findings.find((f) => f.name === 'not-installed')?.blocking).toBe(false);
    expect(result.findings.find((f) => f.name === './missing.js')).toMatchObject({ code: 2307, blocking: false });
    expect(result.findings.find((f) => f.code === 2322)?.blocking).toBe(false);
  }, 30000);

  it('keeps diagnostics in dynamically patched files informational without hiding them', async () => {
    const root = fixture();
    const source = 'class Service { run(value: string) {} }\nnew Service().run();\n';
    for (const patch of ['Object.assign(Service.prototype, {});', 'Object.defineProperty(Service.prototype, "run", {value: () => {}});']) {
      writeFileSync(path.join(root, 'app.ts'), `${source}${patch}\n`);
      const result = await typeCheck(root, [{ file: 'app.ts', ranges: [[2, 2]] }], config());
      expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 2554, blocking: false })]));
      expect(renderTypes(result, 1000)).toContain('info 2554');
    }
    writeFileSync(path.join(root, 'app.ts'), source);
    const result = await typeCheck(root, [{ file: 'app.ts', ranges: null }], config());
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 2554, blocking: true })]));
  }, 30000);

  it('falls back without a project compiler, stays silent in hooks and times out open', async () => {
    const root = fixture(false);
    const changed = [{ file: 'app.ts', ranges: null }];
    const result = await typeCheck(root, changed, config());
    expect(result.available.typescript).not.toBe(true);
    expect(result.findings).toEqual([]);
    expect(renderTypes(result, 400, false)).toBe('');
    expect(renderTypes(result, 400)).toContain('types: unavailable');
    expect((await typeCheck(fixture(), changed, config(), { timeoutMs: 1 })).timedOut).toBe(true);
    expect((await typeCheck(root, [], config())).findings).toEqual([]);
  });

  it('supports TypeScript definitions, implementations and references', async () => {
    const root = fixture(true, 'app.ts', 'export interface I { run(): void }\nexport class C implements I { run() {} }\nconst c = new C();\nc.run();\n');
    expect(await typeNavigate(root, 'app.ts:4:3', 'def', 20000)).toEqual(expect.arrayContaining([expect.objectContaining({ line: 2 })]));
    expect(await typeNavigate(root, 'app.ts:1:18', 'impl', 20000)).toEqual(expect.arrayContaining([expect.objectContaining({ line: 2 })]));
    expect(await typeNavigate(root, 'app.ts:2:14', 'refs', 20000)).toEqual(expect.arrayContaining([expect.objectContaining({ line: 3 })]));
    expect(await typeNavigate(root, 'app.py:1:1', 'def', 20000)).toEqual({ unavailable: 'TypeScript navigation only' });
  }, 60000);

  it.skipIf(spawnSync('pyright', ['--version']).status !== 0)('checks Python typed instances, arguments and baseline', async () => {
    const source = 'class User:\n    name: str = "a"\ndef user() -> User:\n    return User()\ndef count(n: int) -> int:\n    return n\n';
    const root = fixture(false, 'app.py', source);
    writeFileSync(path.join(root, 'app.py'), `${source}user().missing()\ncount("wrong")\n`);
    const result = await typeCheck(root, [{ file: 'app.py', ranges: null }], config());
    expect(result.available.python).toBe(true);
    expect(result.findings.filter((f) => f.blocking).map((f) => f.code)).toEqual(expect.arrayContaining(['reportAttributeAccessIssue', 'reportArgumentType']));
    writeFileSync(path.join(root, 'app.py'), source);
    expect((await typeCheck(root, [{ file: 'app.py', ranges: null }], config())).findings).toEqual([]);
    const old = fixture(false, 'app.py', `${source}user().missing()\n`);
    writeFileSync(path.join(old, 'app.py'), `\n${source}user().missing()\n`);
    const baseline = await typeCheck(old, [{ file: 'app.py', ranges: null }], config());
    expect(baseline.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'reportAttributeAccessIssue', blocking: false, preExisting: true })]));
  }, 60000);
});

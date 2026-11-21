import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { failureEvidence } from '../src/guards/failure-evidence.ts';

// Run with node --import tsx scripts/capture-failures.mjs. See the corpus README for tool bootstrap.
const destination = fileURLToPath(new URL('../fixtures/waste-guards/', import.meta.url));
const root = mkdtempSync(path.join(os.tmpdir(), 'gw-capture-'));
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' };
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60000 });
  if (result.error || result.signal) throw result.error ?? new Error(`${command}: ${result.signal}`);
  return { output: result.stdout + result.stderr, exitCode: result.status };
};
const py = process.env.GW_CAPTURE_PYTHON ?? 'python3';
const bin = (name) => process.env.GW_CAPTURE_NODE_BIN ? path.join(process.env.GW_CAPTURE_NODE_BIN, name) : name;
let count = 0;
function capture(suite, variant, files, command, args, versionArgs = ['--version']) {
  const cwd = path.join(root, `${suite}-${variant}`);
  mkdirSync(cwd);
  for (const [name, source] of Object.entries(files)) writeFileSync(path.join(cwd, name), source);
  const result = run(command, args, cwd);
  if (!result.exitCode) throw new Error(`${suite}-${variant} did not fail`);
  const expected = failureEvidence(result.output);
  if (!expected.length) throw new Error(`${suite}-${variant}: no failure evidence`);
  const fixture = { tool: ['npm', 'pnpm', 'pip'].includes(suite) ? 'install' : suite, output: result.output, expected,
    provenance: { suite, scenario: variant, command: [command, ...args], toolVersion: run(command, versionArgs, cwd).output.trim(), capturedAt: new Date().toISOString(), exitCode: result.exitCode, files } };
  writeFileSync(path.join(destination, `failure-${String(++count).padStart(2, '0')}.json`), JSON.stringify(fixture, null, 2) + '\n');
}
try {
  const pythonFailures = ['assert 2 + 2 == 5', 'assert "cat" in ["dog"]', 'raise ValueError("invalid age")', '[][3]', '{}["missing"]'];
  const jsFailures = ['expect(2 + 2).toBe(5)', 'expect(["dog"]).toContain("cat")', 'throw new TypeError("invalid age")', 'expect({a: 1}).toEqual({a: 2})', 'expect(() => {}).toThrow("missing exception")'];
  for (let i = 0; i < 5; i++) {
    const passes = Array.from({ length: 100 }, (_, j) => `def test_valid_${j}():\n    assert ${j} == ${j}\n`).join('\n');
    capture('pytest', i, { 'test_sample.py': `${passes}\ndef test_failure_${i}():\n    ${pythonFailures[i]}\n` }, py, ['-m', 'pytest', '-vv', '--color=no'], ['-m', 'pytest', '--version']);
    for (const suite of ['vitest', 'jest']) {
      const imports = suite === 'vitest' ? 'import { test, expect } from "vitest";\n' : '';
      const tests = Array.from({ length: 100 }, (_, j) => `test("valid ${j}", () => expect(${j}).toBe(${j}));`).join('\n');
      // Resolve imports from the installed toolchain without adding project dependencies.
      const source = suite === 'vitest' ? imports.replace('"vitest"', JSON.stringify(path.resolve(bin('vitest'), '../../vitest/dist/index.js'))) : imports;
      capture(suite, i, { 'sample.test.js': `${source}${tests}\ntest("failure ${i}", () => { ${jsFailures[i]} });\n`, 'package.json': '{"private":true}', 'vitest.config.mjs': 'export default { test: { pool: "forks", maxWorkers: 1 } };' }, bin(suite), suite === 'jest' ? ['--runInBand', '--verbose', '--no-color'] : ['run', '--reporter=verbose', '--no-color']);
    }
    const ts = ['const age: number = "old";', 'missingFunction();', 'const item = {}; item.name;', 'function f(a: number) {} f();', 'const x: {id: number} = {};'];
    capture('tsc', i, { 'sample.ts': ts[i] }, bin('tsc'), ['--noEmit', '--pretty', 'false', '--skipLibCheck', 'sample.ts']);
    const lint = ['let unused = 1;', 'missing();', 'debugger;', 'if (true) {}', 'let value = 1; value = value;'];
    capture('eslint', i, { 'sample.js': lint[i], 'eslint.config.mjs': 'export default [{ rules: { "no-unused-vars": "error", "no-undef": "error", "no-debugger": "error", "no-constant-condition": "error", "no-self-assign": "error" } }];' }, bin('eslint'), ['sample.js']);
    const ruff = ['import os\n', 'print(undefined_name)\n', 'import os\nimport os\n', 'if True:\n    pass\nimport sys\n', 'x = 1; y = 2\n'];
    capture('ruff', i, { 'sample.py': ruff[i] }, py, ['-m', 'ruff', 'check', '--output-format', 'full', 'sample.py'], ['-m', 'ruff', '--version']);
    for (const suite of ['npm', 'pnpm']) {
      const packages = [
        '{ invalid json',
        JSON.stringify({ private: true, dependencies: { absent: 'file:./missing-package.tgz' } }),
        JSON.stringify({ private: true, scripts: { preinstall: 'node -e "throw new Error(\'preinstall rejected\')"' } }),
        JSON.stringify({ private: true, scripts: { install: 'node -e "require(\'./absent-installer\')"' } }),
        JSON.stringify({ private: true, scripts: { postinstall: 'node -e "throw new RangeError(\'unsupported configuration\')"' } }),
      ];
      capture(suite, i, { 'package.json': packages[i] }, suite === 'npm' ? 'npm' : bin('pnpm'), ['install', '--offline', ...(suite === 'npm' ? ['--no-audit', '--no-fund'] : ['--reporter=append-only'])]);
    }
    const pipFiles = [
      { 'requirements.txt': 'not a valid requirement !!!\n' },
      { 'requirements.txt': './missing-project\n' },
      { 'requirements.txt': '.\n', 'setup.py': 'raise RuntimeError("metadata generation rejected")\n' },
      { 'requirements.txt': '.\n', 'setup.py': 'from setuptools import setup\nsetup(name="invalid", version="not a version")\n' },
      { 'requirements.txt': '.\n', 'pyproject.toml': '[build-system\ninvalid toml\n' },
    ];
    capture('pip', i, pipFiles[i], py, ['-m', 'pip', 'install', '--no-index', '--no-deps', '--no-build-isolation', '-r', 'requirements.txt'], ['-m', 'pip', '--version']);
    capture('generic', i, { 'check.py': `${pythonFailures[i]}\n` }, py, ['check.py']);
  }
  console.log(`Captured ${count} real failing executions in ${destination}`);
} finally { rmSync(root, { recursive: true, force: true }); }

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { scanRepository } from '../src/scan/index.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function scan(files: Record<string, string>) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gw-scan-fa-')); roots.push(root);
  for (const [file, text] of Object.entries({ '.gitignore': '.groundwork/\n', ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  const config = defaultConfig();
  await initSqlBackend(); await refreshIndex(root, { config });
  const db = openDb(indexDbPath(root), { readonly: true });
  try {
    const report = await scanRepository(db, root, { config });
    const list = (items: typeof report.findings) => items.map((f) => `${f.kind} ${f.file}:${f.line}`);
    return { findings: list(report.findings), check: list(report.check) };
  } finally { db.close(); }
}

// Each case is a false alarm measured on the Phase 5 open source run (bench/scan-oss), next to the real defect that must still be reported.
describe('gw scan false alarms', () => {
  it('does not call functions dead that a runtime or test harness runs', async () => {
    const { findings } = await scan({
      'lib.rs': 'fn unused_helper() -> u32 {\n    1\n}\n\n#[test] fn same_line() {}\n\n#[cfg(unix)]\n#[test]\nfn parses_empty() {\n    assert_eq!(1, 1);\n}\n\n// a benchmark\n#[bench]\nfn long_glob(b: &mut Bencher) {\n    b.iter(|| 1);\n}\n\nfn main() {}\n',
      'codec.go': 'package codec\n\nvar API int\n\nfunc init() {\n\tAPI = 1\n}\n\nfunc TestRoundTrip(t *testing.T) {}\n\nfunc unusedHelper() int {\n\treturn 1\n}\n\nfunc initCache() int {\n\treturn 2\n}\n\nfunc mainLoop() int {\n\treturn 3\n}\n\nfunc Testable() int {\n\treturn 4\n}\n',
      'hooks.py': 'import atexit\n\n\n@atexit.register\ndef _flush():\n    return 1\n\n\ndef _unused():\n    return 2\n',
    });
    expect(findings.filter((f) => f.startsWith('dead-code'))).toEqual(['dead-code codec.go:11', 'dead-code codec.go:15', 'dead-code codec.go:19', 'dead-code hooks.py:9', 'dead-code lib.rs:1']);
  });

  it('lists the same constant in same-named sibling files under check, and still reports a copy elsewhere', async () => {
    const { findings, check } = await scan({
      'locale/az/formats.py': 'SHORT_DATE_FORMAT = "d.m.Y"\n',
      'locale/bg/formats.py': 'SHORT_DATE_FORMAT = "d.m.Y"\n',
      'settings.py': 'DEFAULT_CHARSET_NAME = "utf-8-sig"\n',
      'mail.py': 'DEFAULT_CHARSET_NAME = "utf-8-sig"\n',
    });
    expect(findings).toEqual(['duplicate-constant settings.py:1']);
    expect(check).toEqual(['duplicate-constant locale/bg/formats.py:1']);
  });

  it('accepts a bundler query on a relative import and still reports a missing file', async () => {
    const { findings } = await scan({
      'template/README.md': '# hi\n',
      'download.ts': "import readme from './template/README.md?raw';\nimport gone from './template/MISSING.md?raw';\nexport const all = [readme, gone];\n",
    });
    expect(findings).toEqual(['invented-call download.ts:2']);
  });

  it('does not resolve an installed package to a same-named directory the importer cannot reach', async () => {
    const { findings } = await scan({
      'tests/sphinx/__init__.py': '',
      'docs/_ext/djangodocs.py': 'from sphinx import addnodes\n',
      'pkg/__init__.py': '',
      'pkg/shapes.py': 'def area(w, h):\n    return w * h\n',
      'pkg/use.py': 'from pkg.shapes import perimeter\n',
    });
    expect(findings).toEqual(['invented-call pkg/use.py:1']);
  });
});

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { makeTestMatcher } from '../src/index/discover.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb, resetBackendForTests } from '../src/store/db.js';
import { FIXTURES_DIR, tempDir } from '../src/selftest/fixtures.js';
import { synthRepo } from '../src/selftest/synth.js';
import { ensureGwDir, gwPath } from '../src/util/paths.js';

const dirs: string[] = [];
const mk = () => {
  const d = tempDir('gw-refresh-');
  dirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.GW_FORCE_SQLJS;
  resetBackendForTests();
});

const count = (dir: string, sql: string) => {
  const db = openDb(indexDbPath(dir), { readonly: true });
  try {
    return Number(db.prepare(sql).get()?.n);
  } finally {
    db.close();
  }
};

describe('refreshIndex', () => {
  it('classifies common test conventions without matching similarly named production paths', () => {
    const config = defaultConfig(), matches = makeTestMatcher(config);
    for (const file of ['testing/python/fixtures.py', 'pkg/testing/helper.ts', 'spec/parser.ts', 'pkg/specs/parser.py', '__tests__/parser.ts', 'pkg/__tests__/parser.ts', 'test/parser.py', 'pkg/tests/parser.ts', 'parser.test.ts', 'pkg/parser.spec.ts', 'test_parser.py', 'pkg/parser_test.py', 'conftest.py', 'pkg/conftest.py'])
      expect(matches(file), file).toBe(true);
    for (const file of ['src/contest.py', 'src/inspection.py', 'src/testing_tools.py', 'src/specification.ts', 'src/parser.py'])
      expect(matches(file), file).toBe(false);
    config.index.testGlobs = [];
    expect(makeTestMatcher(config)('testing/python/fixtures.py')).toBe(false);
    config.index.testGlobs = ['quality/**/*.ts'];
    expect(makeTestMatcher(config)('quality/parser.ts')).toBe(true);
    expect(makeTestMatcher(config)('tests/parser.ts')).toBe(false);
  });
  it('full rebuild works on an existing sql.js index', async () => {
    process.env.GW_FORCE_SQLJS = '1';
    resetBackendForTests();
    await initSqlBackend();
    const dir = mk();
    synthRepo(dir, 300, 2);
    await refreshIndex(dir);
    const before = count(dir, 'SELECT COUNT(*) n FROM symbols');
    await refreshIndex(dir, { full: true });
    expect(count(dir, 'SELECT COUNT(*) n FROM symbols')).toBe(before);
  });

  it('full rebuild on sql.js does not keep stale export aliases', async () => {
    process.env.GW_FORCE_SQLJS = '1';
    resetBackendForTests();
    await initSqlBackend();
    const dir = mk();
    cpSync(path.join(FIXTURES_DIR, 'ts-app'), dir, { recursive: true, filter: (s) => !s.endsWith('expected.json') });
    await refreshIndex(dir);
    expect(count(dir, 'SELECT COUNT(*) n FROM export_aliases')).toBe(1);
    await refreshIndex(dir, { full: true });
    await refreshIndex(dir, { full: true });
    expect(count(dir, 'SELECT COUNT(*) n FROM export_aliases')).toBe(1);
    expect(count(dir, 'SELECT COUNT(*) n FROM export_aliases a LEFT JOIN files f ON f.id = a.file_id WHERE f.id IS NULL')).toBe(0);
  });

  it('a scoped refresh on an empty index indexes every file', async () => {
    await initSqlBackend();
    const dir = mk();
    synthRepo(dir, 300, 3);
    const r = await refreshIndex(dir, { paths: ['src/mod0.ts'] });
    expect(r.added).toBe(r.files);
  });

  it('reclaims a lock left by a dead process and times out on a live one', async () => {
    await initSqlBackend();
    const dir = mk();
    synthRepo(dir, 100, 4);
    ensureGwDir(dir);
    writeFileSync(gwPath(dir, 'index.lock'), '999999');
    await expect(refreshIndex(dir)).resolves.toBeTruthy();
    writeFileSync(gwPath(dir, 'index.lock'), String(process.ppid));
    await expect(refreshIndex(dir, { lockTimeoutMs: 100 })).rejects.toThrow(/index.lock/);
    expect(readFileSync(gwPath(dir, 'index.lock'), 'utf8')).toBe(String(process.ppid));
  });

  it('relinks imports when tsconfig path aliases change', async () => {
    await initSqlBackend();
    const dir = mk();
    cpSync(path.join(FIXTURES_DIR, 'ts-app'), dir, { recursive: true });
    await refreshIndex(dir);
    const unresolved = "SELECT COUNT(*) n FROM imports WHERE module LIKE '@/%' AND resolved_file_id IS NULL";
    expect(count(dir, unresolved)).toBe(0);
    writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['nowhere/*'] } } }));
    const r = await refreshIndex(dir);
    expect(r.link).not.toBeNull();
    expect(count(dir, unresolved)).toBeGreaterThan(0);
  });
});

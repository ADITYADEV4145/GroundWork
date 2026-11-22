import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedFromGit, changedFromToolInput, parseLineSpec, renderResults, verifyChanged, type VerifyResult } from '../src/grounding/index.js';
import { estimateTokens } from '../src/util/tokens.js';
import { changedFromApplyPatch, locate } from '../src/grounding/ranges.js';
import { nameSimilarity, suggest } from '../src/grounding/suggest.js';
import { inRanges } from '../src/grounding/verify.js';
import { groundAll, plantedReport, PHASE4_CHECKS } from '../src/selftest/checks/phase4.js';
import { FIXTURES_DIR, tempDir, withIndexedFixture } from '../src/selftest/fixtures.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { pythonAdapter } from '../src/lang/python.js';

const MAIN = path.resolve(__dirname, '../src/cli/main.ts');
const TSX = import.meta.resolve('tsx');

describe('grounding', () => {
  it('budgets unchecked batches, findings, headers and omission counts together', () => {
    const unchecked: VerifyResult[] = Array.from({ length: 100 }, (_, i) => ({ file: `src/${'長い名前'.repeat(12)}/${i}.ts`, unchecked: 'not indexed', findings: [] }));
    const text = renderResults(unchecked, 800, { showUnchecked: true });
    expect(estimateTokens(text)).toBeLessThanOrEqual(800);
    const omitted = Number(text.match(/\+(\d+) more unchecked/)![1]);
    expect(text.match(/not checked/g)!.length + omitted).toBe(100);
    const finding: VerifyResult = { file: 'bad.ts', unchecked: null, findings: [{ file: 'bad.ts', line: 1, kind: 'arity', name: 'wrong', message: 'wrong call', blocking: true, suggestions: [] }] };
    const mixed = renderResults([finding, ...unchecked], 800, { showUnchecked: true, header: '{n} issues' });
    expect(mixed).toContain('bad.ts:1 arity: wrong call');
    expect(mixed).toContain('1 issues');
    expect(estimateTokens(mixed)).toBeLessThanOrEqual(800);
    expect(renderResults(unchecked.slice(0, 1), 800, { showUnchecked: true })).toBe(`${unchecked[0]!.file}: not checked (not indexed)`);
    expect(renderResults(unchecked, 1, { showUnchecked: true })).toBe('…');
    expect(renderResults([], 800, { showUnchecked: true })).toBe('');
    expect(renderResults([{ file: 'clean.ts', unchecked: null, findings: [] }], 800, { showClean: true })).toBe('no grounding issues in 1 file');
  });
  it('counts bare generators once while retaining keyword-only, splat and real arity errors', async () => {
    await withIndexedFixture('grounding-py', (db, dir) => {
      const source = readFileSync(path.join(dir, 'app/generator_calls.py'), 'utf8');
      const facts = pythonAdapter.extract(source, 'python');
      expect(facts.hasErrors).toBe(false);
      expect(facts.calls.filter(c => ['consume', 'consume_pair', 'keyword_only'].includes(c.calleeText))
        .map(c => [c.calleeText, c.argCount, c.keywordArgs, c.hasSpread])).toEqual([
        ['consume', 1, [], false], ['consume', 1, [], false], ['consume', 1, [], false],
        ['consume', 0, ['values'], false], ['keyword_only', 0, ['values'], false],
        ['consume', 1, [], true], ['consume', 0, [], true], ['consume', 1, [], true],
        ['consume_pair', 1, [], false], ['consume', 0, [], false], ['consume', 2, [], false],
        ['keyword_only', 1, [], false],
      ]);
      expect(groundAll(db, dir).filter(f => f.file === 'app/generator_calls.py').map(f => [f.line, f.kind]))
        .toEqual([[21, 'arity'], [22, 'arity'], [23, 'arity'], [24, 'arity']]);
    });
  });
  for (const fx of ['grounding-ts', 'grounding-py']) {
    it(`${fx}: every planted error is caught and nothing else fires`, async () => {
      const r = await withIndexedFixture(fx, (db, dir) => plantedReport(dir, groundAll(db, dir)));
      expect(r.planted).toBeGreaterThan(10);
      expect(r.missed).toEqual([]);
      expect(r.extra).toEqual([]);
    });
  }

  it('clean fixtures produce zero findings', async () => {
    for (const fx of ['ts-app', 'py-app']) expect(await withIndexedFixture(fx, (db, dir) => groundAll(db, dir))).toEqual([]);
  });

  it('only definite import and arity errors block', async () => {
    const findings = await withIndexedFixture('grounding-py', (db, dir) => groundAll(db, dir));
    for (const f of findings) expect(f.blocking).toBe(f.kind === 'arity' || f.kind === 'unknown-export' || f.kind === 'missing-module');
  });

  it('suggests the real symbol with location and signature', async () => {
    const f = await withIndexedFixture('grounding-ts', (db, dir) => groundAll(db, dir).find((x) => x.name === 'findByEmail'));
    expect(f?.suggestions[0]).toMatchObject({ name: 'getUserByEmail', file: 'src/lib/users.ts', line: 8 });
    expect(f?.message).toContain('Did you mean getUserByEmail (src/lib/users.ts:8, getUserByEmail(email: string): User | null)');
    expect(nameSimilarity('rates', 'rate')).toBeGreaterThan(nameSimilarity('rates', 'charge'));
    expect(suggest('x', { pool: [] })).toEqual([]);
  });

  it('checks only the given line ranges', async () => {
    const res = await withIndexedFixture('grounding-ts', (db, dir) => verifyChanged(db, dir, [{ file: 'src/bad2.ts', ranges: [[12, 13]] }]));
    expect(res[0]!.findings.map((f) => f.line)).toEqual([12, 13]);
    expect(inRanges(5, [[1, 3]], 6)).toBe(false);
    expect(inRanges(5, [[1, 3]], 6) || inRanges(2, [[1, 3]], 6)).toBe(true);
  });

  it('reports unparseable and unknown files as unchecked', async () => {
    const res = await withIndexedFixture('grounding-ts', (db, dir) => verifyChanged(db, dir, [{ file: 'src/styles.css', ranges: null }, { file: 'nope.ts', ranges: null }]));
    expect(res.map((r) => r.unchecked)).toEqual(['not indexed', 'not indexed']);
  });

  it('a file with parse errors is unchecked, never flagged', async () => {
    await initSqlBackend();
    const dir = tempDir('gw-ground-partial-');
    try {
      cpSync(path.join(FIXTURES_DIR, 'grounding-ts'), dir, { recursive: true });
      writeFileSync(path.join(dir, 'src/bad2.ts'), readFileSync(path.join(dir, 'src/bad2.ts'), 'utf8') + '\nexport function broken( {\n');
      await refreshIndex(dir);
      const db = openDb(indexDbPath(dir), { readonly: true });
      try {
        const [r] = verifyChanged(db, dir, [{ file: 'src/bad2.ts', ranges: null }]);
        expect(r!.unchecked).toBe('parse errors');
        expect(r!.findings).toEqual([]);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('maps edit tool inputs to changed lines', () => {
    const dir = tempDir('gw-ranges-');
    try {
      writeFileSync(path.join(dir, 'a.ts'), 'one\ntwo\nthree\nfour\n');
      expect(changedFromToolInput(dir, dir, { file_path: 'a.ts', old_string: '2', new_string: 'two\nthree' })).toEqual([{ file: 'a.ts', ranges: [[2, 3]] }]);
      expect(changedFromToolInput(dir, dir, { file_path: path.join(dir, 'a.ts'), edits: [{ new_string: 'four' }] })).toEqual([{ file: 'a.ts', ranges: [[4, 4]] }]);
      expect(changedFromToolInput(dir, dir, { file_path: 'a.ts', content: 'x' })).toEqual([{ file: 'a.ts', ranges: null }]);
      expect(changedFromToolInput(dir, dir, { file_path: '../outside.ts', content: 'x' })).toEqual([]);
      expect(changedFromApplyPatch(dir, dir, '*** Begin Patch\n*** Update File: a.ts\n@@\n-2\n+two\n*** End Patch')).toEqual([{ file: 'a.ts', ranges: [[2, 2]] }]);
      expect(locate('a\nb\na\n', ['a'])).toEqual([[1, 1], [3, 3]]);
      expect(parseLineSpec('3-5, 9')).toEqual([[3, 5], [9, 9]]);
      expect(() => parseLineSpec('x')).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gw verify --changed reads git diffs and exits 1 on definite errors', () => {
    const dir = tempDir('gw-verify-cli-');
    try {
      cpSync(path.join(FIXTURES_DIR, 'grounding-ts'), dir, { recursive: true });
      const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
      git('init', '-q');
      git('add', '.');
      git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');
      writeFileSync(path.join(dir, 'src/lib/math.ts'), readFileSync(path.join(dir, 'src/lib/math.ts'), 'utf8') + '\nexport const bad = (): number => add(1);\n');
      writeFileSync(path.join(dir, 'src/new.ts'), "import { add } from './lib/math';\nadd(1, 2);\n");
      expect(changedFromGit(dir).map((c) => c.file).sort()).toEqual(['src/lib/math.ts', 'src/new.ts']);
      const run = (...a: string[]) => {
        try {
          return { code: 0, out: execFileSync(process.execPath, ['--import', TSX, MAIN, '--root', dir, ...a], { encoding: 'utf8' }) };
        } catch (e) {
          return { code: (e as { status: number }).status, out: String((e as { stdout: string }).stdout) };
        }
      };
      const changed = run('--json', 'verify', '--changed');
      expect(changed.code).toBe(1);
      const parsed = JSON.parse(changed.out) as { results: { findings: { kind: string; line: number }[] }[]; blocking: boolean };
      expect(parsed.blocking).toBe(true);
      expect(parsed.results.flatMap((r) => r.findings).map((f) => `${f.kind}:${f.line}`)).toEqual([`arity:${readFileSync(path.join(dir, 'src/lib/math.ts'), 'utf8').split('\n').length - 1}`]);
      const clean = run('verify', path.join(dir, 'src/good.ts'), '--lines', '1-20');
      expect(clean.code).toBe(0);
      expect(clean.out).toContain('no grounding issues');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('phase 4 hook behaviour check passes', async () => {
    const check = PHASE4_CHECKS.find((c) => c.name.startsWith('grounding hook: reports'))!;
    const r = await check.run({ quick: true, sequences: 1 });
    expect(r.detail).toBe('changed-lines only, silent when clean, fail-open');
    expect(r.ok).toBe(true);
  });
});

import { mkdtempSync, readFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { initParsers } from '../src/lang/parser.js';
import { adapterFor } from '../src/lang/index.js';
import type { Language } from '../src/types.js';
import { assertExternalCache, digest } from '../scripts/real-history-dev.js';
import { contractOf, compareContracts, jaccard } from '../scripts/real-history-features.js';
import { auc } from '../scripts/real-history-diagnose.js';
import { separation, type Observation } from '../scripts/render-real-history-dev.js';
import manifest from '../bench/real-history/dev/repos.json' with { type: 'json' };

beforeAll(async () => { await initParsers(); });
const contract = (source: string, language: Language = 'python', name = 'f') => {
  const symbol = adapterFor(language).extract(source, language).symbols.find((s) => s.name === name)!;
  expect(symbol).toBeDefined();
  return contractOf(source, language, symbol)!;
};
const data = <T>(name: string) => JSON.parse(readFileSync(new URL(`../bench/real-history/dev/${name}`, import.meta.url), 'utf8')) as T;

describe('development-only contract prototypes', () => {
  it('records normalized fields, literal subscript keys, compound writes, calls, guards and explicit return shape', () => {
    const c = contract('def f(self, item):\n    if item is None:\n        raise ValueError("missing")\n    self.count += 1\n    item.values.append(self.count)\n    self.options["mode"] = item.mode\n    return {"ok": True, "item": item}\n');
    expect(c.arity).toBe(1);
    expect(c.reads).toEqual(expect.arrayContaining(['SELF.count', '$0.mode']));
    expect(c.writes).toEqual(expect.arrayContaining(['SELF.count', 'SELF.options[mode]', 'mutate:$0.values']));
    expect(c.calls).toContain('$0.values.append');
    expect(c.raises).toEqual(['ValueError']); expect(c.guards).toContain('null:raise');
    expect(c.returns).toEqual(['object:{item,ok}']); expect(c.parameterUse[0]).toBeGreaterThan(0);
  });
  it('recognizes TS comparisons and conditional exits without inventing shapes for returned locals', () => {
    const c = contract('function f(x: { value: number } | null) { if (!x) return null; return x.value > 0; }', 'typescript');
    expect(c.returns).toEqual(['boolean', 'null']); expect(c.earlyReturns).toBe(1);
    expect(c.guards).toContain('truth:return');
    expect(contract('def f(x):\n    result = x\n    return result\n').returns).toEqual([]);
    expect(contract('def f(a, b):\n    return a or b\n').returns).toEqual([]);
  });
  it('excludes nested declarations, nested guard effects and docstrings, and does not call set construction a write', () => {
    const c = contract('def f(self, items):\n    """documentation"""\n    if items:\n        def inner():\n            self.hidden = 1\n            raise RuntimeError("hidden")\n    result = set(items)\n    self.registry.set("visible", result)\n    return items\n');
    expect(c.writes).toEqual(['mutate:SELF.registry']); expect(c.raises).toEqual([]); expect(c.guards).toEqual([]);
    expect(c.literals).toHaveLength(1); expect(c.returns).toEqual(['parameter:$0']);
  });
  it('preserves literal differences hidden by normalized structure and keeps empty unions missing', () => {
    const a = contract('def f():\n    return "add"\n'), b = contract('def f():\n    return "remove"\n');
    const comparison = compareContracts(a, b, { aName: 'add', bName: 'remove', sameFile: false });
    expect(comparison).toMatchObject({ reads: null, writes: null, calls: null, exceptions: null, arity: 1, literals: 0, verbOpposition: 1, sameFile: 0 });
    expect(jaccard([], [])).toBeNull(); expect(jaccard(['x'], [])).toBe(0); expect(jaccard(['x', 'x'], ['x'])).toBe(1);
    expect(compareContracts(null, null, { aName: 'get', bName: 'set', sameFile: true })).toEqual({ sameFile: 1, verbOpposition: 1 });
  });
  it('leaves classes and malformed source unavailable instead of inferring a compatible contract', () => {
    const source = 'class A:\n    pass\n', symbol = adapterFor('python').extract(source, 'python').symbols[0]!;
    expect(contractOf(source, 'python', symbol)).toBeNull();
    const valid = 'def f(x):\n    return x\n', fn = adapterFor('python').extract(valid, 'python').symbols[0]!;
    expect(contractOf('def f(x):\n    return (\n', 'python', fn)).toBeNull();
  });
});

describe('honest development statistics and cache boundaries', () => {
  it('computes ties, reverse separation and missing classes explicitly', () => {
    const point = (value: number) => ({ value, weight: 1 });
    expect(auc([point(1)], [point(0)])).toBe(1); expect(auc([point(0)], [point(1)])).toBe(0);
    expect(auc([point(1)], [point(1)])).toBe(0.5); expect(auc([], [point(0)])).toBeNull();
    expect(separation([], () => null)).toMatchObject({ positiveMean: null, negativeMean: null, auc: null, familyAuc: null });
  });
  it('gives each observed family equal weight, not each combinatorial pair', () => {
    const row = (label: 'positive' | 'negative', family: string, value: number) => ({ review: { label, family }, features: { x: value } });
    const rows = [row('positive', 'a', 1), row('positive', 'a', 1), row('positive', 'a', 1), row('positive', 'b', 0), row('negative', 'c', 0.5)];
    expect(separation(rows, (r) => r.features.x)).toMatchObject({ auc: 0.75, familyAuc: 0.5 });
    expect(() => separation(rows, () => NaN)).toThrow('Nonfinite');
  });
  it('rejects in-repo and symlinked in-repo caches, including missing descendant paths', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gw-history-cache-'));
    try {
      const repo = path.join(root, 'repo'); mkdirSync(repo); symlinkSync(repo, path.join(root, 'alias'), 'dir');
      expect(() => assertExternalCache(path.join(root, 'external'), repo)).not.toThrow();
      for (const candidate of [repo, path.join(repo, 'missing'), path.join(root, 'alias', 'missing')]) expect(() => assertExternalCache(candidate, repo)).toThrow('outside');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('committed development artifact consistency (offline)', () => {
  it('keeps reserved repos out and covers exactly the reviewed pair IDs with valid simultaneous source references', () => {
    expect(manifest.repos.length).toBeGreaterThanOrEqual(3); expect(manifest.repos.length).toBeLessThanOrEqual(5);
    for (const repo of manifest.repos) {
      expect(['got', 'click', 'pytest']).not.toContain(repo.id); expect(repo.start).toMatch(/^[a-f0-9]{40}$/); expect(repo.end).toMatch(/^[a-f0-9]{40}$/);
    }
    const labels = data<{ id: string; reviewer: string; reason: string }[]>('labels.json');
    const rows = manifest.repos.flatMap((r) => data<Observation[]>(`${r.id}-features.json`));
    expect(rows.map((r) => r.id).sort()).toEqual(labels.map((r) => r.id).sort()); expect(new Set(labels.map((r) => r.id)).size).toBe(labels.length);
    for (const row of rows) {
      expect(row.a.revision).toBe(row.b.revision);
      for (const ref of [row.a, row.b]) { expect(ref.revision).toMatch(/^[a-f0-9]{40}$/); expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/); expect(ref.line).toBeGreaterThan(0); expect(ref.endLine).toBeGreaterThanOrEqual(ref.line); }
      expect(row.review.reviewer).toBe('agent-reviewed'); expect(row.review.reason.length).toBeGreaterThan(30);
    }
  });
  it('does not silently turn timeout runs into negatives or changed source scripts into fresh evidence', () => {
    const available = new Set<string>();
    for (const repo of manifest.repos) {
      const normal = data<{ runs: { hash: string; report: { status: string; findings: unknown[]; error?: string } }[] }>(`${repo.id}-normal.json`);
      for (const run of normal.runs) {
        if (run.report.status === 'UNAVAILABLE') { expect(run.report.error).toBeTruthy(); expect(run.report.findings).toEqual([]); }
        else available.add(`${repo.id}:${run.hash}`);
      }
    }
    for (const row of data<Observation[]>('normal-pairs.json')) expect(available.has(`${row.repo}:${row.commit}`)).toBe(true);
    const summary = data<{ sourceHashes: Record<string, string> }>('summary.json');
    for (const [file, hash] of Object.entries(summary.sourceHashes)) expect(digest(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))).toBe(hash);
  });
});

import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { initParsers } from '../src/lang/parser.js';
import { adapterFor } from '../src/lang/index.js';
import type { Language } from '../src/types.js';
import { assertExternalCache } from '../scripts/real-history-dev.js';
import { contractOf, compareContracts, jaccard } from '../scripts/real-history-features.js';
import { auc, directDelegation, validateDirectTarget } from '../scripts/real-history-diagnose.js';
import { separation } from '../scripts/render-real-history-dev.js';
import { actionSeparation } from '../scripts/render-real-history-actions.js';
import manifest from '../bench/real-history/dev/repos.json' with { type: 'json' };

beforeAll(async () => { await initParsers(); });
const contract = (source: string, language: Language = 'python', name = 'f') => {
  const symbol = adapterFor(language).extract(source, language).symbols.find((s) => s.name === name)!;
  expect(symbol).toBeDefined();
  return contractOf(source, language, symbol)!;
};

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
  it('requires the same unchanged target identity, not identical code moved to a new module', () => {
    const ref = { revision: 'before', file: 'helper.ts', symbol: 'helper', line: 1, endLine: 2, kind: 'function', sha256: 'hash' };
    expect(() => validateDirectTarget(ref, { ...ref, revision: 'after' }, ref)).not.toThrow();
    for (const changed of [{ file: 'new.ts' }, { symbol: 'newHelper' }, { sha256: 'changed' }]) expect(() => validateDirectTarget(ref, { ...ref, ...changed }, ref)).toThrow('unchanged');
    expect(() => validateDirectTarget(ref, ref)).toThrow('caller witness');
  });
  it('recognizes whole-body delegation, not a helper used inside a different contract', () => {
    for (const [text, expected] of [['function f(x) { return helper(x) }', true], ['const f = (x) => helper(x)', true], ['function f(x) { sideEffect(); return helper(x) }', false], ['function f(x) { return other(x) }', false], ['function f(x) {}', false]] as const) {
      const s = adapterFor('typescript').extract(text, 'typescript').symbols.find((s) => s.name === 'f')!;
      expect(directDelegation(text, 'typescript', s, 'helper')).toBe(expected);
    }
    const text = 'def f(x):\n    """doc"""\n    return helper(x)\n', s = adapterFor('python').extract(text, 'python').symbols[0]!;
    expect(directDelegation(text, 'python', s, 'helper')).toBe(true);
  });
  it('does not supply extraction or unknown examples to the missing direct-reuse class', () => {
    const rows = [{ review: { family: 'e', label: 'positive', actionClass: 'extract/extend' }, features: { x: 1 } }, { review: { family: 'n', label: 'negative', actionClass: 'related-different' }, features: { x: 0 } }] as const;
    expect(actionSeparation(rows, 'direct-reuse', (r) => r.features.x)).toMatchObject({ positiveAvailable: 0, familyAuc: null });
    expect(actionSeparation(rows, 'extract/extend', (r) => r.features.x)).toMatchObject({ positiveAvailable: 1, familyAuc: 1 });
    expect(() => actionSeparation(rows, 'related-different', (r) => r.features.x)).toThrow('reference');
  });
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

describe('development repository pins', () => {
  it('keeps reserved evaluation repos out of development and retains immutable pins', () => {
    expect(manifest.repos.length).toBeGreaterThanOrEqual(3);
    expect(new Set(manifest.repos.map((r) => r.id)).size).toBe(manifest.repos.length);
    for (const repo of manifest.repos) {
      expect(['got', 'click', 'pytest']).not.toContain(repo.id);
      expect(repo.start).toMatch(/^[a-f0-9]{40}$/);
      expect(repo.end).toMatch(/^[a-f0-9]{40}$/);
    }
  });
});

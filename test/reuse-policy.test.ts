import { describe, expect, it } from 'vitest';
import { canBlock, compatibleKinds, relatedSymbols } from '../src/reuse/policy.js';
import type { Signals } from '../src/reuse/signals.js';
import { CandidateIndex } from '../src/reuse/candidates.js';
import { readFingerprintedSymbols } from '../src/index/query.js';
import { withIndexedFixture } from '../src/selftest/fixtures.js';
import { chooseBlock, metrics, type Prediction } from '../src/reuse/calibration.js';

const signals = { structure: 0, exact: 0, bindingExact: 0, vocabulary: 1, paramCount: 1,
  paramNames: 1, returnType: 1, name: 1, structureVocabulary: 0, exactVocabulary: 0 } satisfies Signals;
const fn = { kind: 'function', file: 'a.ts', qualifiedName: 'outer', startByte: 0, endByte: 200 };
describe('independent, substitutable BLOCK evidence', () => {
  it('excludes containing spans in either direction and dotted ancestry, not sibling name prefixes', () => {
    for (const child of [{ ...fn, qualifiedName: 'renamed', startByte: 10, endByte: 100 },
      { ...fn, qualifiedName: 'outer.child', startByte: 300, endByte: 500 }]) {
      expect(relatedSymbols(fn, child)).toBe(true); expect(relatedSymbols(child, fn)).toBe(true);
    }
    expect(relatedSymbols(fn, { ...fn, qualifiedName: 'outermost', startByte: 200, endByte: 300 })).toBe(false);
    expect(relatedSymbols(fn, { ...fn, file: 'b.ts' })).toBe(false);
    expect(relatedSymbols({}, {})).toBe(false);
  });
  it('allows only class/class and function-or-method/function-or-method blocking families', () => {
    expect(compatibleKinds({ kind: 'class' }, { kind: 'dataclass' })).toBe(true);
    expect(compatibleKinds(fn, { kind: 'method' })).toBe(true);
    for (const kind of ['class', 'constant', 'variable', 'interface', undefined]) expect(compatibleKinds(fn, { kind })).toBe(false);
    expect(compatibleKinds({}, {})).toBe(false);
  });
  it('never blocks from vocabulary/signature/meaning alone, with a majority-structure boundary', () => {
    const other = { ...fn, file: 'b.ts' };
    expect(canBlock(fn, other, { ...signals, meaning: 1 })).toBe(false);
    expect(canBlock(fn, other, { ...signals, structure: 0.499 })).toBe(false);
    expect(canBlock(fn, other, { ...signals, structure: 0.5 })).toBe(true);
    expect(canBlock(fn, other, { ...signals, exact: 1 })).toBe(true);
    expect(canBlock(fn, other, { ...signals, bindingExact: 1 })).toBe(true);
    expect(canBlock(fn, fn, { ...signals, exact: 1 })).toBe(false);
  });
  it('filters the actual candidate path by ranges even if qualified names differ', async () => {
    await withIndexedFixture('reuse-app', (db) => {
      const candidate = readFingerprintedSymbols(db).find((s) => s.name === 'parseDateString')!;
      const index = new CandidateIndex(db);
      const query = { ...candidate, id: 'new-id', qualifiedName: 'differentName' };
      expect(index.find(query).some((s) => s.id === candidate.id)).toBe(false);
      expect(index.find({ ...query, file: 'other.ts' }).some((s) => s.id === candidate.id)).toBe(true);
    });
  });
  it('counts filtered positives as recall loss while retaining WARN scores and threshold ties', () => {
    const p = (label: string, eligible: boolean, probability: number) => ({ probability, blockEligible: eligible,
      example: { label: { label } } }) as Prediction;
    const rows = [p('dup', false, 0.99), p('not', false, 0.99), p('dup', true, 0.9), p('not', true, 0.8)];
    expect(metrics(rows, 0.85, true)).toMatchObject({ tp: 1, fp: 0, recall: 0.5 });
    expect(metrics(rows, 0.85)).toMatchObject({ tp: 2, fp: 1 });
    expect(chooseBlock(rows)).toBe(0.9);
  });
});

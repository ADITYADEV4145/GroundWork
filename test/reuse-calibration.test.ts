import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chooseBlock, labelSchema, loadDataset, metrics, outOfFold, predict, recallByType, SIGNAL_KEYS, train, type Example, type Prediction } from '../src/reuse/calibration.js';
import { model } from '../src/reuse/model.js';
import { PHASE3_CHECKS } from '../src/selftest/checks/phase3.js';
import type { Signals } from '../src/reuse/signals.js';

const signals = (value: number): Signals => ({ structure: value, exact: value, vocabulary: value, paramCount: value, paramNames: value, returnType: value, name: value });
const example = (dup: boolean, group = 'one'): Example => ({
  label: { id: `${group}-${dup}`, a: { file: `corpus/${group}/a.ts`, symbol: 'a' }, b: { file: `corpus/${group}/b.ts`, symbol: 'b' },
    label: dup ? 'dup' : 'not', cloneType: dup ? 1 : null, ...(!dup ? { negativeKind: 'different-purpose' } : {}), reasoning: 'Reviewed implementation semantics differ as stated.' },
  a: { name: 'a', params: [], returnType: null, docstring: dup ? 'matching operation' : 'other operation', fingerprint: null },
  b: { name: 'b', params: [], returnType: null, docstring: 'matching operation', fingerprint: null },
  group, signals: signals(dup ? 1 : 0),
});
const prediction = (score: number, dup: boolean): Prediction => ({ probability: score, fold: 0, example: example(dup) });

describe('reuse calibration', () => {
  it('selects the lowest qualifying threshold inclusively and never splits ties', () => {
    const predictions = [prediction(0.9, true), prediction(0.8, true), prediction(0.7, false), prediction(0.7, true), prediction(0.1, false)];
    expect(chooseBlock(predictions)).toBe(0.8);
    expect(metrics(predictions, 0.8)).toEqual({ tp: 2, fp: 0, fn: 1, precision: 1, recall: 2 / 3, support: 3 });
    expect(chooseBlock([prediction(0.6, true), prediction(0.6, false), prediction(0.9, true)], 1)).toBe(0.9);
    expect(() => chooseBlock([prediction(0.7, false)])).toThrow('No nonempty');
    expect(() => chooseBlock([])).toThrow('No nonempty');
    expect(metrics([], 0.5).precision).toBe(0);
    expect(recallByType(predictions, 0.8)[3]?.recall).toBe(0);
  });

  it('trains deterministically, leaves ablated weights zero, and rejects one-class data', () => {
    const data = [example(true), example(false)];
    const fit = train(data, ['vocabulary']);
    expect(predict(fit, data[0]!.signals)).toBeGreaterThan(predict(fit, data[1]!.signals));
    expect(fit.weights.structure).toBe(0);
    expect(train(data, ['vocabulary'])).toEqual(fit);
    expect(() => train([], SIGNAL_KEYS)).toThrow('both classes');
    expect(() => train([example(true)], SIGNAL_KEYS)).toThrow('both classes');
    const grouped = { examples: ['a', 'b', 'c', 'd', 'e'].flatMap((group) => [example(true, group), example(false, group)]), digest: '', symbols: [] };
    const predictions = outOfFold(grouped, ['vocabulary']);
    expect(predictions).toHaveLength(10);
    for (const group of ['a', 'b', 'c', 'd', 'e']) expect(new Set(predictions.filter((p) => p.example.group === group).map((p) => p.fold)).size).toBe(1);
    expect(() => outOfFold(grouped, SIGNAL_KEYS, 6)).toThrow('fold count');
  });

  it('validates labels and reproduces the committed family-disjoint operating point', async () => {
    expect(labelSchema.safeParse({ ...example(true).label, cloneType: null }).success).toBe(false);
    expect(labelSchema.safeParse({ ...example(false).label, negativeKind: undefined }).success).toBe(false);
    const dataset = await loadDataset(path.resolve(__dirname, '../bench/dupes'));
    expect(dataset.examples.length).toBeGreaterThanOrEqual(400);
    expect(dataset.digest).toBe(model.calibration.datasetDigest);
    expect(new Set(dataset.examples.map((e) => e.group)).size).toBe(12);
    for (const type of [1, 2, 3, 4]) expect(dataset.examples.some((e) => e.label.cloneType === type)).toBe(true);
    for (const kind of ['overloads', 'same-name-different-behavior', 'similar-structure-different-purpose']) expect(dataset.examples.some((e) => e.label.negativeKind === kind)).toBe(true);
    const check = await PHASE3_CHECKS[0]!.run({ quick: true, sequences: 1 });
    expect(check.ok, check.detail).toBe(true);
    expect(check.metrics?.precision).toBeGreaterThanOrEqual(0.95);
    expect(check.detail).toContain('Type 4');
    expect(model.thresholds.warn).toBeLessThan(model.thresholds.block);
  });
});

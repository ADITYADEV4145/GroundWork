import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { initParsers } from '../src/lang/parser.js';
import { adapterFor } from '../src/lang/index.js';
import { contractOf as prototype } from '../scripts/real-history-features.js';
import { contractSignals } from '../src/reuse/contracts.js';
import { extractReuseSource } from '../src/reuse/source.js';
import { buildIdf, pairSignals } from '../src/reuse/signals.js';
import { loadTrainingDataset } from '../src/reuse/calibration.js';

beforeAll(initParsers);
describe('contract evidence in reuse scoring', () => {
  it('reuses the reviewed prototype semantics without changing stored adapter fingerprints', () => {
    for (const [language, source] of [['typescript', 'function f(x) { if (!x) return null; return x.value.trim(); }'], ['python', 'def f(x):\n    if x is None:\n        raise ValueError("missing")\n    return x.value.strip()\n']] as const) {
      const old = adapterFor(language).extract(source, language).symbols[0]!;
      const current = extractReuseSource(source, language).symbols[0]!;
      expect(current.fingerprint).toEqual(old.fingerprint);
      expect('contract' in current && current.contract).toEqual(prototype(source, language, old));
      const signals = pairSignals(current, current, buildIdf([current]));
      expect(signals.contractCalls).toBe(1); expect(signals.contractReads).toBe(1);
      expect(signals.contractValidation).toBe(1);
    }
  });
  it('treats empty and unavailable evidence as no positive contract signal', () => {
    expect(Object.values(contractSignals(null, null))).toEqual([0, 0, 0, 0, 0]);
    expect(extractReuseSource('', 'typescript').symbols).toEqual([]);
    const invalid = extractReuseSource('function f(x) { return x + ; }', 'typescript');
    expect(invalid.hasErrors).toBe(true);
    expect(invalid.symbols.every((s) => !('contract' in s) || s.contract == null)).toBe(true);
  });
  it('excludes unknown dev cases and balances combinatorial dev family members without reserved history', async () => {
    const data = await loadTrainingDataset(path.resolve(__dirname, '../bench/dupes'));
    const dev = data.examples.filter((e) => e.population === 'dev');
    expect(dev).toHaveLength(63);
    for (const group of new Set(dev.map((e) => e.group))) expect(dev.filter((e) => e.group === group).reduce((n, e) => n + e.weight!, 0)).toBeCloseTo(1);
    expect(dev.some((e) => /unknown|dev:(got|click|pytest):/.test(e.group))).toBe(false);
    expect(new Set(dev.filter((e) => e.label.label === 'dup').map((e) => e.group)).size).toBe(8);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interval, summarize } from './bench-charts.mjs';

test('task bootstrap handles a constant distribution', () => {
  assert.deepEqual(interval([5, 5, 5]), { median: 5, low: 5, high: 5 });
});
test('empty and invalid reductions fail explicitly', () => {
  assert.throws(() => interval([]), /nonempty/);
  assert.throws(() => interval([NaN]), /finite/);
});
test('summary sums repeats by task and computes mean time and success', () => {
  const captures = ['baseline', 'groundwork'].map((condition) => ({ condition, samples: [1, 2].map(() => ({ task: 'a', success: true, wallMs: 2000, toolOutputBytes: condition === 'baseline' ? 100 : 80 })) }));
  const result = summarize({ captures }, [{ id: 'a' }]);
  assert.deepEqual(result.reduction, { median: 20, low: 20, high: 20 });
  assert.equal(result.baseline.wallSeconds, 2);
  assert.equal(result.groundwork.success, 2);
  assert.throws(() => summarize({ captures: [] }, []), /Missing baseline/);
  assert.throws(() => summarize({ captures }, [{ id: 'missing' }]), /Missing baseline output/);
});

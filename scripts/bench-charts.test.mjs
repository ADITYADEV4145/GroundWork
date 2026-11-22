import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interval, summarize } from './bench-charts.mjs';

test('task bootstrap handles a constant distribution', () => {
  assert.deepEqual(interval([5, 5, 5]), { median: 5, low: 5, high: 5 });
});
test('empty and invalid reductions fail explicitly', () => {
  assert.throws(() => interval([]), /nonempty/);
  assert.throws(() => interval([NaN]), /finite/);
});
test('summary sums repeats by task and computes mean time and success', () => {
  const captures = ['baseline', 'groundwork'].flatMap((condition) => [1, 2].map((run) => ({ condition, run, samples: [{ task: 'a', success: true, wallMs: condition === 'baseline' ? 2000 : 3000, toolOutputBytes: condition === 'baseline' ? 100 : 80 }] })));
  const result = summarize({ captures }, [{ id: 'a' }]);
  assert.deepEqual(result.reduction, { median: 20, low: 20, high: 20 });
  assert.equal(result.baseline.wallSeconds, 2);
  assert.equal(result.groundwork.success, 2);
  assert.equal(result.runs, 2);
  assert.deepEqual(result.wallReduction, { median: -50, low: -50, high: -50 });
  assert.throws(() => summarize({ captures: [] }, []), /Missing baseline/);
  assert.throws(() => summarize({ captures }, [{ id: 'missing' }]), /Incomplete/);
  assert.throws(() => summarize({ captures: [...captures, captures[0]] }, [{ id: 'a' }]), /duplicate/);
});

test('eight-run sample sizes derive from evidence', () => {
  const captures = ['baseline', 'groundwork'].flatMap((condition) => Array.from({ length: 8 }, (_, i) => ({ condition, run: i + 1, samples: [{ task: 'a', success: true, wallMs: 1000, toolOutputBytes: 40 }] })));
  const summary = summarize({ captures }, [{ id: 'a' }]);
  assert.equal(summary.runs, 8);
  assert.equal(summary.baseline.attempts, 8);
});

test('chart statistics match both combined grader reports', () => {
  for (const suite of ['nav', 'long-horizon']) {
    const read = (file) => JSON.parse(readFileSync(new URL(`../bench/${suite}/${file}`, import.meta.url), 'utf8'));
    const { evidence, summary: report } = read('results/combined.json')[0];
    assert.deepEqual(read('results/combined.evidence.json'), evidence);
    const summary = summarize(evidence, read('tasks.json').tasks);
    assert.deepEqual(summary.reduction, report.estimatedToolOutputReductionPct);
    assert.deepEqual(summary.wallReduction, report.wallTimeReductionPct);
    assert.equal(summary.runs, report.runs);
    for (const arm of ['baseline', 'groundwork']) {
      assert.equal(summary[arm].wallSeconds, report[arm].wallMs / report[arm].attempts / 1000);
      assert.equal(summary[arm].success, report[arm].success);
    }
  }
});

test('published benchmark prose matches the combined reports', () => {
  const pages = ['README.md', 'website/public/benchmarks.html'].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  for (const suite of ['nav', 'long-horizon']) {
    const { summary } = JSON.parse(readFileSync(new URL(`../bench/${suite}/results/combined.json`, import.meta.url), 'utf8'))[0];
    for (const page of pages) {
      for (const interval of [summary.estimatedToolOutputReductionPct, summary.wallTimeReductionPct]) {
        const label = `${interval.median.toFixed(1)}% [${interval.low.toFixed(1)}, ${interval.high.toFixed(1)}]`;
        assert.ok(page.includes(label), label);
      }
      for (const arm of ['baseline', 'groundwork']) {
        const result = summary[arm];
        assert.ok(page.includes(`${result.success}/${result.attempts}`));
        assert.ok(page.includes(`${(result.wallMs / result.attempts / 1000).toFixed(2)}s`));
      }
      assert.ok(page.includes('find_similar'));
    }
  }
});

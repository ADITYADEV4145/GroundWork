import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { options, planArchive, validateCaptures } from './bench-combine.mjs';

test('combine defaults to eight runs and accepts explicit inputs', () => {
  assert.equal(options([]).runs, 8);
  assert.equal(options(['--runs', '3', '--nav-captures', '/captures']).navCaptures, '/captures');
  assert.throws(() => options(['--runs', '0']), /positive integer/);
  assert.throws(() => options(['--unknown', 'x']), /Use/);
  assert.throws(() => options(['--runs']), /Use/);
});
test('checked-in navigation exports have complete, pinned provenance', () => {
  const dir = new URL('../bench/nav/observations/', import.meta.url).pathname;
  const runs = JSON.parse(readFileSync(new URL('../bench/nav/results/combined.json', import.meta.url), 'utf8'))[0].summary.runs;
  assert.equal(validateCaptures(dir, 'nav', runs).length, runs * 2);
  assert.throws(() => validateCaptures(dir, 'nav', runs + 1), /Expected/);
  assert.throws(() => validateCaptures(dir, 'long-horizon', runs), /provenance/);
});

test('empty, duplicate and incompatible capture directories are rejected', () => {
  const dir = mkdtempSync(path.join(os.homedir(), 'bench-combine-test-'));
  try {
    assert.throws(() => validateCaptures(dir, 'nav', 1), /Expected 2/);
    const capture = JSON.parse(readFileSync(new URL('../bench/nav/observations/nav-baseline-1.json', import.meta.url), 'utf8'));
    writeFileSync(path.join(dir, 'a.json'), JSON.stringify(capture));
    writeFileSync(path.join(dir, 'b.json'), JSON.stringify(capture));
    assert.throws(() => validateCaptures(dir, 'nav', 1), /duplicate/);
    writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ ...capture, condition: 'groundwork', captureRevision: 'other' }));
    assert.throws(() => validateCaptures(dir, 'nav', 1), /provenance/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archive planning permits new and byte-identical captures but rejects replacements', () => {
  const dir = mkdtempSync(path.join(os.homedir(), 'bench-archive-test-'));
  try {
    const source = path.join(dir, 'source.json');
    const target = path.join(dir, 'nav-baseline-1.json');
    const capture = { condition: 'baseline', run: 1 };
    const rows = [{ source, capture }];
    const original = JSON.stringify(capture);
    writeFileSync(source, original);
    assert.deepEqual(planArchive([], dir, 'nav'), []);
    assert.deepEqual(planArchive(rows, dir, 'nav'), [{ source, target }]);
    writeFileSync(target, original);
    assert.deepEqual(planArchive(rows, dir, 'nav'), []);
    assert.deepEqual(planArchive([{ source: target, capture }], dir, 'nav'), []);
    writeFileSync(source, original + '\n');
    assert.throws(() => planArchive(rows, dir, 'nav'), /Refusing to overwrite differing archived capture/);
    assert.equal(readFileSync(target, 'utf8'), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('three-run replay selects only runs 1 through 3 from both bundled eight-run directories', () => {
  const config = options([]);
  for (const [suite, dir] of [['nav', config.navCaptures], ['long-horizon', config.lhCaptures]]) {
    const rows = validateCaptures(dir, suite, 3);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map(({ capture: c }) => `${c.condition}:${c.run}`).sort(),
      ['baseline:1', 'baseline:2', 'baseline:3', 'groundwork:1', 'groundwork:2', 'groundwork:3']);
  }
});

test('higher runs are ignored without masking missing or duplicate selected runs', () => {
  const dir = mkdtempSync(path.join(os.homedir(), 'bench-selection-test-'));
  try {
    const capture = JSON.parse(readFileSync(new URL('../bench/nav/observations/nav-baseline-1.json', import.meta.url), 'utf8'));
    const higher = { ...capture, run: 4, captureRevision: 'other' };
    for (const file of ['higher-a.json', 'higher-b.json']) writeFileSync(path.join(dir, file), JSON.stringify(higher));
    writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(capture));
    assert.throws(() => validateCaptures(dir, 'nav', 1), /Expected 2/);
    writeFileSync(path.join(dir, 'groundwork.json'), JSON.stringify({ ...capture, condition: 'groundwork' }));
    assert.equal(validateCaptures(dir, 'nav', 1).length, 2);
    writeFileSync(path.join(dir, 'duplicate.json'), JSON.stringify(capture));
    assert.throws(() => validateCaptures(dir, 'nav', 1), /duplicate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

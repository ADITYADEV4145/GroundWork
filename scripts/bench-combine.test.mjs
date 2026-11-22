import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { options, validateCaptures } from './bench-combine.mjs';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCaptureRuns } from '../bench/long-horizon/verify-results.mjs';

const captures = (runs) => Array.from({ length: runs }, (_, i) => ['baseline', 'groundwork'].map((condition) => ({
  condition, run: i + 1, observations: [{ task: 'a' }, { task: 'b' }],
}))).flat();

test('raw exports accept three or eight complete paired runs', () => {
  for (const runs of [3, 8]) assert.equal(verifyCaptureRuns(captures(runs), ['a', 'b']), runs);
});

test('empty, missing, duplicate and noncontiguous runs are rejected', () => {
  assert.throws(() => verifyCaptureRuns([], ['a', 'b']), /no raw captures/);
  assert.throws(() => verifyCaptureRuns(captures(8).slice(1), ['a', 'b']), /complete paired runs/);
  assert.throws(() => verifyCaptureRuns([...captures(3), captures(3)[0]], ['a', 'b']), /duplicate raw capture/);
  assert.throws(() => verifyCaptureRuns(captures(3).map((c) => ({ ...c, run: c.run + 1 })), ['a', 'b']), /complete paired runs/);
  assert.throws(() => verifyCaptureRuns(captures(1).map((c) => ({ ...c, run: 0 })), ['a', 'b']), /invalid run/);
});

test('each raw capture must contain exactly the expected tasks', () => {
  for (const observations of [[{ task: 'a' }], [{ task: 'a' }, { task: 'a' }], [{ task: 'a' }, { task: 'other' }]]) {
    assert.throws(() => verifyCaptureRuns([{ ...captures(1)[0], observations }, captures(1)[1]], ['a', 'b']), /incomplete or duplicate tasks/);
  }
});

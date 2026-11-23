import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const pin = '36f54a0845fe2bf4184549cf5cef8f216a8957ab';
const manifest = json('bench/V9-INPUTS.json');

test('v9 preserves all 80 raw captures, their provenance and the rejected LH action', () => {
  assert.equal(manifest.captureRevision, pin);
  assert.equal(manifest.captures.length, 80);
  const seen = new Set();
  for (const entry of manifest.captures) {
    const bytes = readFileSync(path.join(root, entry.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    const c = JSON.parse(bytes);
    assert.equal(c.captureRevision, pin);
    assert.equal(c.protocol, 'stable-v1');
    assert.equal(c.condition, entry.condition);
    assert.equal(c.run, entry.run);
    const key = `${entry.group}:${entry.condition}:${entry.run}`;
    assert.ok(!seen.has(key)); seen.add(key);
    const suite = json(`bench/${c.suite}/tasks.json`);
    assert.equal(c.revision, suite.revision);
    assert.deepEqual(c.observations.map(o => o.task), suite.tasks.map(t => t.id));
  }
  const expected = ['nav9', 'lh9'].flatMap(group => ['baseline', 'groundwork'].flatMap(arm => Array.from({ length: 16 }, (_, i) => `${group}:${arm}:${i + 1}`)));
  expected.push(...Array.from({ length: 16 }, (_, i) => `nav9c:groundwork:${i + 1}`));
  assert.deepEqual([...seen].sort(), expected.sort());
  const rejected = json('bench/long-horizon/v9/observations/lh9-groundwork-6.json').observations[8];
  assert.equal(rejected.task, 'lh-09');
  assert.equal(rejected.tools[0].action, 'outline');
  assert.equal(rejected.tools[0].bytes, 30);
  assert.equal(rejected.tools[0].durationMs, 0.06839899999999943);
});

test('v9 labels official, deviation and exploratory grading evidence without a confirmatory LH result', () => {
  for (const [folder, status] of [['nav/v9c/results', 'official compliant navigation'], ['nav/v9/results', 'disclosed regenerated-skill navigation deviation'], ['long-horizon/v9/exploratory-results', 'exploratory-only; no confirmatory verdict']]) {
    const report = json(`bench/${folder}/combined.json`)[0];
    const phase = json(`bench/${folder}/phase-a.json`);
    assert.equal(phase.status, status);
    assert.equal(report.summary.captureRevision, pin);
    assert.equal(report.evidence.captures.length, 32);
    assert.ok(report.evidence.captures.every(c => c.captureRevision === pin && c.protocol === 'stable-v1'));
    for (const arm of ['baseline', 'groundwork']) {
      assert.equal(phase.metrics.turns[arm].mean, report.summary[arm].toolCalls / 16);
      assert.equal(report.summary[arm].success, report.summary[arm].attempts);
    }
  }
  assert.equal(existsSync(path.join(root, 'bench/long-horizon/v9/results/combined.json')), false);
});

test('v9 publication states engineering gate passage without speed, correctness or shipping claims', () => {
  for (const file of ['README.md', 'website/public/benchmarks.html']) {
    const text = read(file);
    const block = text.split('<!-- phase-a-v9:start -->')[1].split('<!-- phase-a-v9:end -->')[0];
    assert.ok(text.indexOf('<!-- phase-a-v9:start -->') < text.indexOf('<!-- stable-protocol:start -->'));
    for (const phrase of ['compliant 51.8 vs 60.3 baseline', 'no speed win', '−389% reduction', 'success 480/480 each arm', 'PR #41 was measured, not shipped', 'never in its place', 'no confirmatory verdict', 'lh-09 run 6', 'EXPLORATORY ONLY', 'No long-horizon gate verdict or overall Phase A pass']) assert.ok(block.includes(phrase), `${file}: ${phrase}`);
    assert.match(block, /-1\.42% \[-9\.81, 6\.53\]/);
    assert.match(block, /-5\.32% \[-13\.94, 2\.48\]/);
    assert.match(block, /-16\.07% \[-25\.07, -7\.46\]/);
  }
  const analysis = read('bench/V9-ANALYSIS.md');
  assert.match(analysis, /independent binary provenance is not recorded/);
  assert.match(analysis, /agent omitted the `mcp` subcommand/);
  assert.match(analysis, /generic `shell` bucket/);
});

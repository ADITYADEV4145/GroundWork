import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadEvidence, renderReport } from '../../dist/bench/runner.js';
import { captureSchema } from '../../dist/bench/schema.js';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const stem = './results/2026-11-21T20-56-14-672Z-long-horizon';
const records = JSON.parse(read(stem + '.json'));
assert.equal(records.length, 1);
const recorded = records[0];
const replay = loadEvidence('long-horizon', 3);
assert.deepEqual(replay, recorded, 'offline evidence must reproduce the saved JSON');
assert.equal(read('./evidence.json'), read(stem + '.long-horizon.evidence.json'));
const markdown = renderReport(replay.summary);
assert.equal(markdown, read(stem + '.md'), 'saved Markdown must match the reporter');

assert.equal(replay.evidence.captures.length, 6);
assert.equal(readdirSync(new URL('./observations/', import.meta.url)).filter((file) => file.endsWith('.json')).length, 6);
for (const capture of replay.evidence.captures) {
  const raw = captureSchema.parse(JSON.parse(read(`./observations/lh-${capture.condition}-${capture.run}.json`)));
  const { observations, ...rawMetadata } = raw;
  const { samples, ...gradedMetadata } = capture;
  assert.deepEqual(gradedMetadata, rawMetadata, 'original run labels and metadata must be unchanged');
  assert.equal(observations.length, samples.length);
  for (const sample of samples) {
    const observation = observations.find((item) => item.task === sample.task);
    assert.ok(observation, sample.task);
    const measured = {
      toolCalls: observation.tools.length,
      toolOutputBytes: observation.tools.reduce((sum, tool) => sum + tool.bytes, 0),
      filesRead: new Set(observation.tools.flatMap((tool) => tool.file === undefined ? [] : [tool.file])).size,
      readBytes: observation.tools.reduce((sum, tool) => sum + (tool.readBytes ?? 0), 0),
      readBlocks: observation.tools.filter((tool) => tool.blocked).length,
      wallMs: observation.wallMs,
      usage: observation.usage,
    };
    for (const [key, value] of Object.entries(measured)) assert.deepEqual(sample[key], value, `${raw.condition} ${raw.run} ${sample.task} ${key}`);
  }
}
console.log('PASS six raw captures retain original labels and match all recorded timing/tool measurements');
console.log('PASS offline evidence digest, JSON summary and Markdown reproduce exactly');

const headline = markdown.slice(markdown.indexOf('| Measure |'), markdown.indexOf('| Task category |')).trimEnd()
  + '\n\n' + markdown.slice(markdown.indexOf('| Suite metric |'), markdown.indexOf('Tool-output counts')).trimEnd();
const label = 'Devin-agent results (6 sessions: 3 baseline, 3 Groundwork; 10 sequential tasks each); tokens are estimated tool-output tokens (bytes/4), not model tokens';
for (const file of ['../../README.md', './README.md']) {
  const doc = read(file);
  const match = /<!-- long-horizon-results:start -->\n([\s\S]*?)\n<!-- long-horizon-results:end -->/.exec(doc);
  assert.ok(match, `${file} headline block missing`);
  assert.equal(match[1], headline, `${file} headline must exactly match the reporter's numbers and intervals`);
  assert.ok(doc.includes(label), `${file} measurement label missing`);
  assert.ok(doc.includes('staging directory'), `${file} staging deviation missing`);
  assert.ok(doc.includes('failed-then-retried tool call'), `${file} retry deviation missing`);
  console.log(`PASS ${file} headline table, medians and 95% intervals exactly match results JSON`);
}

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluatorFingerprint } from './evaluator-fingerprint.mjs';

export function verifyCaptureRuns(captures, taskIds) {
  assert.ok(captures.length > 0, 'no raw captures');
  const pairs = new Set();
  let runs = 0;
  for (const capture of captures) {
    assert.ok(Number.isSafeInteger(capture.run) && capture.run > 0, 'invalid run number');
    assert.ok(['baseline', 'groundwork'].includes(capture.condition), 'invalid condition');
    const pair = `${capture.condition}:${capture.run}`;
    assert.ok(!pairs.has(pair), `duplicate raw capture ${pair}`);
    pairs.add(pair);
    runs = Math.max(runs, capture.run);
    assert.deepEqual(capture.observations.map((item) => item.task).sort(), [...taskIds].sort(), `${pair}: incomplete or duplicate tasks`);
  }
  assert.equal(pairs.size, runs * 2, 'expected complete paired runs 1 through N');
  return runs;
}

async function verifyResults() {
  const { loadEvidence, renderReport } = await import(new URL('../../dist/bench/runner.js', import.meta.url));
  const { captureSchema, evidenceSchema } = await import(new URL('../../dist/bench/schema.js', import.meta.url));

  const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
  const archive = './results/pre-19/long-horizon/';
  const historicalTasks = JSON.parse(read(archive + 'tasks.json'));
  const currentTasks = JSON.parse(read('./tasks.json'));
  assert.deepEqual({ ...currentTasks, revision: historicalTasks.revision }, historicalTasks, 'only the active fixture pin may differ from historical tasks');
  assert.equal(read('./grade.mjs'), read(archive + 'grade.mjs'), 'historical grader must be unchanged');
  const fingerprint = evaluatorFingerprint();

  function verifySet({ name, directory, evidenceFile, benchDir, observationDir, prefix }) {
    const files = readdirSync(new URL(directory, import.meta.url)).filter((file) => file.endsWith('-long-horizon.json'));
    assert.equal(files.length, 1, `${name} must have exactly one saved report`);
    const stem = directory + files[0].slice(0, -5);
    const records = JSON.parse(read(stem + '.json'));
    assert.equal(records.length, 1);
    const recorded = records[0];
    const rawEvidence = JSON.parse(read(evidenceFile));
    assert.deepEqual(rawEvidence.evaluator, fingerprint, `${name}: recorded evaluator is stale: evaluator or fixture files changed`);
    assert.deepEqual(recorded.evidence.evaluator, rawEvidence.evaluator, `${name}: results must record the same evaluator fingerprint`);
    const runs = recorded.summary.runs;
    assert.ok(Number.isSafeInteger(runs) && runs > 0, `${name}: invalid saved run count`);
    const replay = loadEvidence('long-horizon', runs, fileURLToPath(new URL(benchDir, import.meta.url)));
    assert.deepEqual(replay, { ...recorded, evidence: evidenceSchema.parse(recorded.evidence) }, `${name}: offline evidence must reproduce the saved JSON`);
    assert.equal(read(evidenceFile), read(stem + '.long-horizon.evidence.json'));
    const markdown = renderReport(replay.summary);
    assert.equal(markdown, read(stem + '.md'), `${name}: saved Markdown must match the reporter`);

    assert.equal(replay.evidence.captures.length, runs * 2);
    const exports = readdirSync(new URL(observationDir, import.meta.url)).filter((file) => file.endsWith('.json'))
      .map((file) => captureSchema.parse(JSON.parse(read(observationDir + file))));
    const exportRuns = verifyCaptureRuns(exports, replay.summary.tasks.map((task) => task.task));
    assert.ok(exportRuns >= runs, `${name}: raw exports must cover all saved runs`);
    for (const capture of exports) {
      for (const key of ['suite', 'revision', 'captureRevision', 'agent', 'model', 'node']) {
        assert.deepEqual(capture[key], replay.evidence.captures[0][key], `${name}: incompatible raw capture ${key}`);
      }
    }
    for (const capture of replay.evidence.captures) {
      const raw = captureSchema.parse(JSON.parse(read(`${observationDir}${prefix}-${capture.condition}-${capture.run}.json`)));
      const { observations, ...rawMetadata } = raw;
      const { samples, ...gradedMetadata } = capture;
      assert.deepEqual(gradedMetadata, rawMetadata, `${name}: original run labels and metadata must be unchanged`);
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
        for (const [key, value] of Object.entries(measured)) assert.deepEqual(sample[key], value, `${name} ${raw.condition} ${raw.run} ${sample.task} ${key}`);
      }
    }
    console.log(`PASS ${name}: evaluator and fixture file fingerprint (${Object.keys(fingerprint.files).length} files)`);
    console.log(`PASS ${name}: ${exports.length} raw captures form ${exportRuns} complete paired runs; ${runs * 2} saved captures match all recorded timing/tool measurements`);
    console.log(`PASS ${name}: manifest, offline evidence digest, JSON summary and Markdown reproduce exactly`);
    return { markdown, runs, tasks: replay.summary.tasks.length };
  }

  verifySet({ name: 'historical pre-19', directory: archive, evidenceFile: archive + 'evidence.json',
    benchDir: './results/pre-19/', observationDir: archive + 'observations/', prefix: 'lh' });
  const { markdown, runs, tasks } = verifySet({ name: 'active fa8657c', directory: './results/', evidenceFile: './evidence.json',
    benchDir: '../', observationDir: './observations/', prefix: 'lh2' });

  const headline = markdown.slice(markdown.indexOf('| Measure |'), markdown.indexOf('| Task category |')).trimEnd()
    + '\n\n' + markdown.slice(markdown.indexOf('| Suite metric |'), markdown.indexOf('Tool-output counts')).trimEnd();
  const label = `Devin-agent results (${runs * 2} sessions: ${runs} baseline, ${runs} Groundwork; ${tasks} sequential tasks each); tokens are estimated tool-output tokens (bytes/4), not model tokens`;
  for (const file of ['../../README.md', './README.md']) {
    const doc = read(file);
    const match = /<!-- long-horizon-results:start -->\n([\s\S]*?)\n<!-- long-horizon-results:end -->/.exec(doc);
    assert.ok(match, `${file} headline block missing`);
    assert.equal(match[1], headline, `${file} headline must exactly match the reporter's numbers and intervals`);
    assert.ok(doc.includes(label), `${file} measurement label missing`);
    assert.ok(doc.includes('self-reported collection deviations'), `${file} collection deviation disclosure missing`);
    console.log(`PASS ${file} headline table, medians and 95% intervals exactly match results JSON`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await verifyResults();

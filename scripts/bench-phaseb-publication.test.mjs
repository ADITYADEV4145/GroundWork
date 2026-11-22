import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyze } from '../bench/multiturn-reuse/analyze.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const hash = value => createHash('sha256').update(value).digest('hex');
const pin = '831fca40500094b904eb5078b5982884a057a439';
const folder = 'bench/multiturn-reuse/v1';
const manifest = json('bench/PHASEB-INPUTS.json');
const records = json(`${folder}/results/records.json`);
const summary = json(`${folder}/results/analysis.json`);
const intervals = json(`${folder}/results/bootstrap.json`);
const chains = ['click-summary', 'click-values', 'pytest-escape', 'pytest-async'];
const verdict = 'Phase B gate failed in both modes: neither arm produced detectable duplicated logic at turn 5 (0% vs 0%), so the primary metric could not show a GroundWork reduction.';

test('Phase B preserves exactly64 original captures, fixed task order and canonical grader hashes', () => {
  assert.equal(manifest.captureRevision, pin);
  assert.equal(manifest.captures.length, 64);
  assert.equal(readdirSync(path.join(root, folder, 'observations')).length, 64);
  const tasks = json('bench/multiturn-reuse/tasks.json');
  const seen = new Set();
  for (const entry of manifest.captures) {
    const bytes = readFileSync(path.join(root, entry.path));
    assert.equal(hash(bytes), entry.sha256);
    const c = JSON.parse(bytes);
    assert.equal(c.captureRevision, pin);
    assert.equal(c.revision, tasks.revision);
    assert.equal(c.protocol, 'stable-v1');
    assert.equal(c.suite, 'multiturn-reuse');
    assert.equal(c.sessionStartBasis, 'workspace-ready');
    for (const field of ['condition', 'agent', 'run', 'chain']) assert.equal(c[field], entry[field]);
    const mode = c.agent.replace('Devin ', '');
    assert.equal(entry.label, `reuse-${mode}-${c.chain}-${c.condition}-${c.run}`);
    assert.equal(c.chain, chains[(c.run - 1) % 4]);
    assert.deepEqual(c.observations.map(o => o.task), tasks.tasks.filter(t => t.sequence === c.chain).map(t => t.id));
    assert.ok(!seen.has(entry.label)); seen.add(entry.label);
    const record = records.find(r => r.agent === c.agent && r.condition === c.condition && r.chain === c.chain && r.run === c.run);
    assert.equal(record.inputSha256, hash(JSON.stringify(c)));
  }
  const expected = ['normal', 'fusion'].flatMap(mode => ['baseline', 'groundwork'].flatMap(arm => Array.from({ length: 16 }, (_, i) => `reuse-${mode}-${chains[i % 4]}-${arm}-${i + 1}`)));
  assert.deepEqual([...seen].sort(), expected.sort());
});

test('Phase B keeps frozen evidence, product attestations and the failed primary gate', () => {
  assert.equal(manifest.artifacts.length, 7);
  for (const entry of manifest.artifacts) assert.equal(hash(readFileSync(path.join(root, entry.path))), entry.sha256);
  const notes = json(`${folder}/results/workflow-notes.json`);
  assert.equal(notes.length, 64);
  assert.equal(manifest.productPins.baseline, '10fc7493ed024d817b5cabf7cbf4aaa97533825c');
  assert.equal(manifest.productPins.groundwork, '6fe635f586654359514c614402b0b0243c915b32');
  for (const entry of manifest.captures) {
    const note = notes.find(n => n.label === entry.label).note;
    assert.ok(note.includes(pin) && note.includes(manifest.productPins[entry.condition]));
  }
  const { collectorProductPin, ...frozen } = summary;
  assert.equal(collectorProductPin, pin);
  assert.deepEqual(analyze(records), frozen);
  assert.equal(summary.gate, false);
  assert.equal(records.length, 64);
  for (const r of records) for (const t of r.turns) {
    assert.equal(t.success, true);
    assert.equal(t.duplicateRate, 0);
    assert.ok(t.cumulativeTokens > 0);
    assert.equal(t.emptyGrowth, false);
  }
  for (const mode of summary.results) {
    assert.equal(mode.win, false);
    assert.equal(mode.guardrail, true);
    assert.deepEqual(mode.primary.ciPp, [0, 0]);
    assert.equal(mode.guardrails.length, 20);
  }
});

test('Phase B publication retains terminal tables, secondary labels and all three disclosures', () => {
  const number = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2, roundingMode: 'halfEven' });
  const format = (x, scale) => `${number.format(x.mean * scale)} [${number.format(x.low * scale)}, ${number.format(x.high * scale)}]`;
  for (const file of ['README.md', 'website/public/benchmarks.html', 'bench/PHASEB-ANALYSIS.md']) {
    const text = read(file);
    const block = file.endsWith('ANALYSIS.md') ? text : text.split('<!-- phase-b-v1:start -->')[1].split('<!-- phase-b-v1:end -->')[0];
    assert.ok(block.includes(verdict));
    assert.ok(block.includes('nominal intervals, not a substitute for the failed primary gate'));
    for (const phrase of ['identical product pins', 'uncaptured read-only', 'shell-quoting', 'Four never-started sessions were terminated and relaunched fresh on the same pins, with no data collected from the first attempts']) assert.ok(block.includes(phrase), `${file}: ${phrase}`);
    const normalized = block.replaceAll('−', '-');
    for (const mode of ['normal', 'fusion']) for (const [field, scale] of [['duplicateRate', 100], ['cumulativeReuseRate', 100], ['reuseRate', 100], ['cumulativeLoc', 1]]) {
      for (const arm of ['baseline', 'groundwork', 'difference']) assert.ok(normalized.includes(format(intervals.metrics[mode]['5'][field][arm], scale)), `${file}: ${mode}/${field}/${arm}`);
    }
  }
});

test('Phase B publication leaves the home page, product, collector, protocol and grader unchanged', () => {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const files = git('ls-tree', '-r', '--name-only', pin).trim().split('\n').filter(file => file.startsWith('src/') || file.startsWith('bench/multiturn-reuse/') || ['bench/PROTOCOL.md', 'bench/PROTOCOL-REUSE.md', 'bench/capture.mjs', 'scripts/bench-multiturn-reuse.mjs', 'website/public/index.html'].includes(file));
  for (const file of files) assert.equal(read(file), git('show', `${pin}:${file}`), file);
});

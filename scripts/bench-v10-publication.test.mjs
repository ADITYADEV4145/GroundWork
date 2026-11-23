import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const manifest = json('bench/V10-INPUTS.json');
const snapshots = json('bench/v10/results/analysis.json').comparisons;
const pin = 'e3bdc7401daf7264b242b32a2d7bc4de09178f69';
const base = 'dcb2ad7223c81449e9b80909d20265536f6d1dff';
const records = manifest.captures.map(entry => ({ ...entry, capture: json(entry.path) }));
const mean = xs => xs.reduce((sum, value) => sum + value, 0) / xs.length;

function bootstrap(bs, gs) {
  assert.equal(bs.length, 16); assert.equal(gs.length, 16);
  assert.ok([...bs, ...gs].every(Number.isFinite));
  let state = 0x51ab17ed;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
  const draw = xs => mean(Array.from({ length: xs.length }, () => xs[Math.floor(random() * xs.length)]));
  const values = { baseline: [], groundwork: [], delta: [], reduction: [] };
  for (let i = 0; i < 10_000; i++) {
    const b = draw(bs), g = draw(gs);
    for (const [key, value] of Object.entries({ baseline: b, groundwork: g, delta: g - b, reduction: 100 * (1 - g / b) })) values[key].push(value);
  }
  for (const xs of Object.values(values)) xs.sort((a, b) => a - b);
  return Object.fromEntries(Object.entries(values).map(([key, xs]) => [key, {
    mean: key === 'baseline' ? mean(bs) : key === 'groundwork' ? mean(gs) : key === 'delta' ? mean(gs) - mean(bs) : 100 * (1 - mean(gs) / mean(bs)),
    low: xs[249], high: xs[9749], ...(key === 'reduction' ? { adjustedLow: xs[124] } : {}),
  }]));
}

test('v10 retains all96 hashed raw captures, including exactly one rejected action', () => {
  assert.equal(manifest.captureRevision, pin); assert.equal(manifest.armsNoteRevision, base);
  assert.equal(records.length, 96);
  const labels = new Set(), bad = [];
  for (const r of records) {
    assert.equal(hash(readFileSync(path.join(root, r.path))), r.sha256);
    assert.ok(!labels.has(r.label)); labels.add(r.label);
    const c = r.capture, tasks = json(`bench/${r.suite}/tasks.json`);
    assert.equal(c.captureRevision, pin); assert.equal(c.revision, tasks.revision);
    assert.equal(c.suite, r.suite); assert.equal(c.condition, r.condition); assert.equal(c.run, r.run);
    assert.equal(c.protocol, 'stable-v1'); assert.equal(c.sessionStartBasis, 'workspace-ready');
    assert.deepEqual(c.observations.map(o => o.task), tasks.tasks.map(t => t.id));
    for (const o of c.observations) for (const t of o.tools) if (!['mcp', 'shell', 'read'].includes(t.action)) bad.push([r.label, o.task, t]);
  }
  for (const suite of ['nav', 'long-horizon']) for (const group of ['v10', 'v10d']) {
    const expected = group === 'v10' ? 32 : 16;
    assert.equal(readdirSync(path.join(root, `bench/${suite}/${group}/observations`)).length, expected);
    for (const arm of group === 'v10' ? ['baseline', 'groundwork'] : ['groundwork']) {
      assert.deepEqual(records.filter(r => r.suite === suite && r.group === group && r.condition === arm).map(r => r.run).sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1));
    }
  }
  assert.equal(bad.length, 1); assert.deepEqual(bad[0].slice(0, 2), ['v10-lh-groundwork-11', 'lh-04']);
  assert.equal(bad[0][2].action, 'outline'); assert.equal(bad[0][2].bytes, 30);
  const validation = json('bench/v10/validation/schema.json').results;
  assert.equal(validation.filter(r => r.success).length, 95);
  assert.equal(validation.find(r => !r.success).file, 'v10-lh-groundwork-11.json');
  assert.ok(validation.find(r => r.file === 'v10d-lh-groundwork-13.json').success);
});

test('v10 hashes all generated evidence and limits normalization to one analysis-only action', () => {
  for (const entry of manifest.artifacts) assert.equal(hash(readFileSync(path.join(root, entry.path))), entry.sha256, entry.path);
  git('ls-files', '--error-unmatch', '--', ...manifest.artifacts.map(a => a.path));
  assert.equal(manifest.normalizations.length, 1);
  const n = manifest.normalizations[0], original = json(n.raw), copy = json(n.analysisCopy);
  const t = copy.observations[3].tools[0];
  assert.equal(t.action, 'shell'); assert.equal(t.analysisOriginalAction, 'outline');
  assert.match(t.analysisNormalization, /not an executed shell or MCP tool/);
  t.action = t.analysisOriginalAction; delete t.analysisOriginalAction; delete t.analysisNormalization;
  assert.deepEqual(copy, original);
  for (const c of Object.values(manifest.comparisons)) {
    const report = json(c.files['combined.json'])[0];
    assert.equal(report.summary.captureRevision, pin); assert.equal(report.summary.runs, 16);
    assert.equal(report.summary.sessionPrimary.basis, 'recorded-session');
    assert.deepEqual(report.evidence, json(c.files['combined.evidence.json']));
    assert.equal(report.summary.noSuccessDrop, true);
  }
});

test('v10 independently reproduces whole-session intervals and eligible gates', () => {
  assert.throws(() => bootstrap([], []));
  assert.throws(() => bootstrap(Array(16).fill(NaN), Array(16).fill(1)));
  for (const [id, config] of Object.entries(manifest.comparisons)) {
    const metric = (r, key) => {
      const c = r.capture, tools = c.observations.flatMap(o => o.tools);
      return key === 'elapsedMsPerTask' ? (c.sessionEndedAt - c.sessionStartedAt) / c.observations.length
        : key === 'actions' ? tools.length : tools.reduce((sum, t) => sum + t[key === 'emittedBytesPerSession' ? 'bytes' : 'durationMs'], 0);
    };
    const arm = (group, condition) => records.filter(r => r.suite === config.suite && r.group === group && r.condition === condition).sort((a, b) => a.run - b.run);
    for (const key of ['elapsedMsPerTask', 'emittedBytesPerSession', 'toolSideMsPerSession', 'actions']) {
      const x = bootstrap(arm('v10', 'baseline').map(r => metric(r, key)), arm(config.group, 'groundwork').map(r => metric(r, key)));
      for (const [name, fields] of Object.entries(x)) for (const [field, value] of Object.entries(fields)) assert.ok(Math.abs(value - snapshots[id][key][name][field]) < 1e-7, `${id}/${key}/${name}/${field}`);
    }
    const s = snapshots[id], gate = s.gate;
    assert.equal(gate.actions, s.actions.groundwork.mean <= s.actions.baseline.mean);
    assert.equal(gate.time, s.elapsedMsPerTask.reduction.high >= 0);
    assert.equal(gate.verdict, config.exploratory ? 'NO CONFIRMATORY VERDICT' : gate.actions && gate.time && gate.success ? 'PASS' : 'FAIL');
  }
});

test('v10 publication preserves numbers, distinctions and required disclosures', () => {
  const nf = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2, roundingMode: 'halfEven' });
  const format = x => `${nf.format(x.mean)} [${nf.format(x.low)}, ${nf.format(x.high)}]`;
  for (const file of ['README.md', 'website/public/benchmarks.html', 'bench/V10-ANALYSIS.md']) {
    const content = read(file);
    const block = file.endsWith('ANALYSIS.md') ? content : content.split('<!-- v10-results:start -->')[1].split('<!-- v10-results:end -->')[0];
    for (const phrase of ['navigation engineering gate passed on fewer actions', 'no speed win', 'session-time intervals cross zero', 'about 5x baseline', 'Official long-horizon has no confirmatory verdict', 'v10-lh-groundwork-11', 'lh-04', 'EXPLORATORY ONLY', '18 never-started sessions across 17 units', 'future pre-registered run only']) assert.ok(block.includes(phrase), `${file}: ${phrase}`);
    if (!file.endsWith('ANALYSIS.md')) for (const [id, s] of Object.entries(snapshots)) {
      for (const key of ['elapsedMsPerTask', 'emittedBytesPerSession', 'toolSideMsPerSession']) {
        for (const arm of ['baseline', 'groundwork']) assert.ok(block.includes(nf.format(s[key][arm].mean)), `${file}/${id}/${key}/${arm}`);
        assert.ok(block.includes(format(s[key].reduction)), `${file}/${id}/${key}/reduction`);
      }
      for (const arm of ['baseline', 'groundwork', 'delta']) assert.ok(block.includes(format(s.actions[arm])), `${file}/${id}/actions/${arm}`);
    }
  }
  const body = read('bench/V10-ANALYSIS.md').split('<!-- v10-analysis-source:start -->\n')[1].split('<!-- v10-analysis-source:end -->')[0];
  assert.equal(hash(body), manifest.analysisSourceSha256);
});

test('v10 preserves prior publication content, home page, product, harness, grader and protocol', () => {
  for (const [file, sha] of Object.entries(manifest.preexistingPublicationSha256)) {
    const content = read(file).replace(/<!-- v10-results:start -->[\s\S]*?<!-- v10-results:end -->\n\n/, '');
    assert.equal(hash(content), sha, file);
  }
  const baseline = new Set(git('ls-tree', '-r', '--name-only', base).trim().split('\n'));
  const changedBaseline = git('diff', '--name-only', base).trim().split('\n').filter(file => baseline.has(file) && !['README.md', 'website/public/benchmarks.html'].includes(file));
  assert.deepEqual(changedBaseline, []);
});

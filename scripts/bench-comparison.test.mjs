import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AFTER_REVISION, comparisonCharts, generateComparison, loadComparison, sections, tableRows } from './bench-comparison.mjs';
import { options } from './bench-combine-v2.mjs';
import { combine, validateCaptures } from './bench-combine.mjs';

const root = new URL('../', import.meta.url).pathname;
const read = (file) => readFileSync(file, 'utf8');
function fixture() {
  const dir = mkdtempSync(path.join(os.homedir(), 'bench-comparison-test-'));
  for (const suite of ['nav', 'long-horizon']) {
    const target = path.join(dir, 'bench', suite);
    mkdirSync(path.join(target, 'results'), { recursive: true });
    for (const file of ['tasks.json', 'results/combined.json']) cpSync(path.join(root, 'bench', suite, file), path.join(target, file));
  }
  mkdirSync(path.join(dir, 'website/public'), { recursive: true });
  for (const file of ['README.md', 'website/public/benchmarks.html']) cpSync(path.join(root, file), path.join(dir, file));
  return dir;
}
function seedAfter(dir, transform = (report) => report) {
  for (const suite of ['nav', 'long-horizon']) {
    const report = JSON.parse(read(path.join(dir, 'bench', suite, 'results/combined.json')));
    for (const capture of report[0].evidence.captures) capture.captureRevision = AFTER_REVISION;
    const target = path.join(dir, 'bench', suite, 'v2/results');
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'combined.json'), JSON.stringify(transform(report)));
  }
}
test('v2 inputs pin the new collector and use the branch build, never historical builds', () => {
  const config = options([]);
  assert.equal(config.experiment, 'v2');
  assert.equal(config.captureRevision, AFTER_REVISION);
  assert.equal(config.navBuild, root);
  assert.equal(options(['--build', '/build']).lhBuild, '/build');
  assert.throws(() => options(['--runs', '3']), /Use/);
  assert.throws(() => options(['--build']), /Use/);
  assert.throws(() => combine({ ...config, runs: 3 }), /eight runs/);
  assert.throws(() => validateCaptures(path.join(root, 'bench/nav/observations'), 'nav', 8, AFTER_REVISION), /provenance/);
});
test('empty after state is explicitly pending; generated prose/charts match saved data', () => {
  const dir = fixture();
  try {
    const rows = generateComparison(dir);
    assert.equal(rows.filter((r) => !r.summary).length, 2);
    assert.match(sections(rows).markdown, /After results are pending/);
    const expected = sections(loadComparison());
    assert.ok(read(path.join(root, 'README.md')).includes(expected.markdown));
    assert.ok(read(path.join(root, 'website/public/benchmarks.html')).includes(expected.html));
    for (const [name, chart] of Object.entries(comparisonCharts(loadComparison()))) {
      for (const base of ['docs/assets/bench', 'website/public/bench']) assert.equal(read(path.join(root, base, `before-after-${name}.svg`)), chart);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('old eight-run reports in a synthetic v2 layout populate every comparison cell without changing before', () => {
  const dir = fixture();
  try {
    const before = read(path.join(dir, 'bench/nav/results/combined.json'));
    seedAfter(dir);
    const rows = generateComparison(dir), cells = tableRows(rows);
    assert.equal(cells[0][1], '240/240 / 240/240');
    assert.deepEqual(cells[0].slice(1), cells[1].slice(1));
    assert.deepEqual(cells[2].slice(1), cells[3].slice(1));
    assert.equal(cells[3][2], '-63.2% [-86.1, -38.6]');
    for (const cell of cells.flat()) {
      assert.ok(read(path.join(dir, 'README.md')).includes(cell));
      assert.ok(read(path.join(dir, 'website/public/benchmarks.html')).includes(cell));
    }
    assert.doesNotMatch(sections(rows).markdown, /results are pending/);
    assert.match(sections(rows).markdown, /protocol change/);
    assert.equal(read(path.join(dir, 'bench/nav/results/combined.json')), before);
    assert.equal(existsSync(path.join(dir, 'docs/assets/bench/copied-code.svg')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('incomplete, stale-revision and inconsistent after reports fail before publishing', () => {
  const dir = fixture();
  try {
    seedAfter(dir);
    const target = path.join(dir, 'bench/nav/v2/results/combined.json'), original = read(path.join(dir, 'README.md'));
    rmSync(target);
    assert.throws(() => generateComparison(dir), /Both v2/);
    seedAfter(dir, (reports) => { reports[0].evidence.captures[0].captureRevision = 'wrong'; return reports; });
    assert.throws(() => generateComparison(dir), /capture revision/);
    seedAfter(dir, (reports) => { reports[0].summary.baseline.success--; return reports; });
    assert.throws(() => generateComparison(dir), /Inconsistent/);
    seedAfter(dir, (reports) => { reports[0].summary.runs = 3; return reports; });
    assert.throws(() => generateComparison(dir), /eight-run/);
    assert.equal(read(path.join(dir, 'README.md')), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AFTER_REVISION, ROUND2_REVISION, ROUND3_REVISION, comparisonCharts, generateComparison, loadComparison, sections, tableRows } from './bench-comparison.mjs';
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
function seedAfter(dir, transform = (report) => report, version = 'v2') {
  for (const suite of ['nav', 'long-horizon']) {
    const report = JSON.parse(read(path.join(dir, 'bench', suite, 'results/combined.json')));
    for (const capture of report[0].evidence.captures) capture.captureRevision = ({ v2: AFTER_REVISION, v3: ROUND2_REVISION, v4: ROUND3_REVISION })[version];
    const target = path.join(dir, 'bench', suite, version, 'results');
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
test('v3 option selects isolated directories and the round-2 build revision regardless of argument order', () => {
  const config = options(['--build', '/build', '--experiment', 'v3']);
  assert.equal(config.experiment, 'v3');
  assert.equal(config.captureRevision, ROUND2_REVISION);
  assert.equal(config.navCaptures, path.join(root, 'bench/nav/v3/observations'));
  assert.equal(config.lhCaptures, path.join(root, 'bench/long-horizon/v3/observations'));
  assert.equal(config.navBuild, '/build');
  assert.equal(config.lhBuild, '/build');
  assert.equal(options(['--experiment', 'v3', '--nav-captures', '/nav3']).navCaptures, '/nav3');
  assert.throws(() => options(['--experiment', 'v5']), /Use/);
  assert.throws(() => combine({ ...config, runs: 3 }), /eight runs/);
  assert.throws(() => combine({ ...config, experiment: 'v5' }), /Unknown experiment/);
  assert.throws(() => validateCaptures(path.join(root, 'bench/nav/v2/observations'), 'nav', 8, ROUND2_REVISION), /provenance/);
});
test('v4 option selects isolated directories and requires the round-3 build revision', () => {
  const config = options(['--experiment', 'v4', '--build', '/round3-build']);
  assert.equal(config.experiment, 'v4');
  assert.equal(config.captureRevision, ROUND3_REVISION);
  assert.equal(config.navCaptures, path.join(root, 'bench/nav/v4/observations'));
  assert.equal(config.lhCaptures, path.join(root, 'bench/long-horizon/v4/observations'));
  assert.equal(config.navBuild, '/round3-build');
  assert.equal(config.lhBuild, '/round3-build');
  assert.equal(options(['--nav-captures', '/nav3-inputs', '--lh-captures', '/lh3-inputs', '--experiment', 'v4']).navCaptures, '/nav3-inputs');
  assert.equal(options(['--experiment', 'v4']).navBuild, root);
  assert.throws(() => combine({ ...config, runs: 3 }), /eight runs/);
  assert.throws(() => validateCaptures(path.join(root, 'bench/nav/v3/observations'), 'nav', 8, ROUND3_REVISION), /provenance/);
});
test('empty after state is explicitly pending; generated prose/charts match saved data', () => {
  const dir = fixture();
  try {
    const rows = generateComparison(dir);
    assert.equal(rows.filter((r) => !r.summary).length, 6);
    assert.match(sections(rows).markdown, /round 1 and round 2 and Round 3 at ff57851 results are pending/);
    const expected = sections(loadComparison());
    assert.ok(read(path.join(root, 'README.md')).includes(expected.markdown));
    assert.ok(read(path.join(root, 'website/public/benchmarks.html')).includes(expected.html));
    for (const [name, chart] of Object.entries(comparisonCharts(loadComparison()))) {
      for (const base of ['docs/assets/bench', 'website/public/bench']) assert.equal(read(path.join(root, base, `before-after-${name}.svg`)), chart);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('old eight-run reports in synthetic v2/v3/v4 layouts populate every comparison cell without changing before', () => {
  const dir = fixture();
  try {
    const before = read(path.join(dir, 'bench/nav/results/combined.json'));
    seedAfter(dir);
    seedAfter(dir, undefined, 'v3');
    seedAfter(dir, undefined, 'v4');
    const rows = generateComparison(dir), cells = tableRows(rows);
    assert.equal(cells[0][1], '240/240 / 240/240');
    assert.deepEqual(cells[0].slice(1), cells[1].slice(1));
    assert.equal(cells.length, 8);
    assert.deepEqual(cells[1].slice(1), cells[2].slice(1));
    assert.deepEqual(cells[2].slice(1), cells[3].slice(1));
    assert.deepEqual(cells[4].slice(1), cells[5].slice(1));
    assert.deepEqual(cells[5].slice(1), cells[6].slice(1));
    assert.deepEqual(cells[6].slice(1), cells[7].slice(1));
    assert.equal(cells[7][2], '-63.2% [-86.1, -38.6]');
    for (const cell of cells.flat()) {
      assert.ok(read(path.join(dir, 'README.md')).includes(cell));
      assert.ok(read(path.join(dir, 'website/public/benchmarks.html')).includes(cell));
    }
    assert.doesNotMatch(sections(rows).markdown, /results are pending/);
    assert.match(sections(rows).markdown, /protocol change/);
    for (const content of Object.values(sections(rows))) {
      assert.match(content, /small shared helpers/);
      assert.match(content, /targets had already been read/);
      assert.match(content, /retried before work/);
      assert.match(content, /where_used validation error was not retried/);
      assert.match(content, /whole file using shell cat/);
      assert.match(content, /received exports contain no session notes or protocol-deviation annotations/);
      assert.match(content, /does not establish uniform protocol adherence/);
    }
    assert.equal(read(path.join(dir, 'bench/nav/results/combined.json')), before);
    assert.equal(existsSync(path.join(dir, 'docs/assets/bench/copied-code.svg')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('completed round 1 remains published while rounds 2 and 3 are pending in both suites and charts', () => {
  const dir = fixture();
  try {
    seedAfter(dir);
    const v2 = read(path.join(dir, 'bench/nav/v2/results/combined.json'));
    const rows = generateComparison(dir);
    assert.deepEqual(rows.map((row) => Boolean(row.summary)), [true, true, false, false, true, true, false, false]);
    const content = sections(rows);
    assert.match(content.markdown, /round 2 and Round 3 at ff57851 results are pending/);
    assert.doesNotMatch(content.markdown, /no post-fix measurements/);
    for (const revision of [AFTER_REVISION, ROUND2_REVISION, ROUND3_REVISION]) assert.ok(content.markdown.includes(revision));
    assert.match(content.markdown, /rg for trivial lookups, exact-first find_code, actionable-only find_similar/);
    assert.match(content.markdown, /baselines were re-collected at that round’s commit/);
    assert.equal(read(path.join(dir, 'bench/nav/v2/results/combined.json')), v2);
    assert.equal(existsSync(path.join(dir, 'bench/nav/v3/results/combined.json')), false);
    for (const chart of Object.values(comparisonCharts(rows))) {
      assert.equal((chart.match(/Pending fresh eight-run results/g) ?? []).length, chart.includes('wall time') ? 8 : 4);
      assert.match(chart, /round 2/);
      assert.doesNotMatch(chart, /NaN|undefined/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('round 3 stays pending while the first three experiments remain unchanged', () => {
  const dir = fixture();
  try {
    seedAfter(dir);
    seedAfter(dir, undefined, 'v3');
    const reports = ['nav', 'long-horizon'].flatMap((suite) => ['', 'v2', 'v3'].map((version) => path.join(dir, 'bench', suite, version, 'results/combined.json')));
    const before = reports.map(read);
    const rows = generateComparison(dir);
    assert.deepEqual(rows.map((row) => Boolean(row.summary)), [true, true, true, false, true, true, true, false]);
    const pending = tableRows(rows).filter(([label]) => label.includes('Round 3 at ff57851'));
    assert.equal(pending.length, 2);
    for (const row of pending) assert.deepEqual(row.slice(1), ['Pending', 'Pending', 'Pending', 'Pending']);
    for (const content of Object.values(sections(rows))) {
      assert.match(content, /Round 3 at ff57851 results are pending/);
      assert.match(content, /no measurements for those experiments are published yet/);
      assert.match(content, /explore-first traces/);
      assert.match(content, /verification-only rereads/);
      assert.doesNotMatch(content, /V4 export limitations/);
    }
    for (const [name, chart] of Object.entries(comparisonCharts(rows))) {
      assert.equal((chart.match(/Pending fresh eight-run results/g) ?? []).length, name === 'wall' ? 4 : 2);
      assert.match(chart, /Four experiments/);
      assert.doesNotMatch(chart, /NaN|undefined/);
      const height = Number(chart.match(/height="(\d+)"/)[1]);
      for (const [, y] of chart.matchAll(/<text x="[^"]+" y="([^"]+)"/g)) assert.ok(Number(y) < height - 10);
      assert.ok(sections(rows).html.includes(`height="${height}"`));
    }
    assert.deepEqual(reports.map(read), before);
    for (const suite of ['nav', 'long-horizon']) assert.equal(existsSync(path.join(dir, 'bench', suite, 'v4')), false);
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
test('partial, wrong-revision and inconsistent v3 reports cannot update published pages', () => {
  const dir = fixture();
  try {
    seedAfter(dir);
    seedAfter(dir, undefined, 'v3');
    const page = read(path.join(dir, 'README.md'));
    rmSync(path.join(dir, 'bench/nav/v3/results/combined.json'));
    assert.throws(() => generateComparison(dir), /Both v3/);
    seedAfter(dir, (reports) => { reports[0].evidence.captures[0].captureRevision = AFTER_REVISION; return reports; }, 'v3');
    assert.throws(() => generateComparison(dir), /v3 capture revision/);
    seedAfter(dir, (reports) => { reports[0].summary.groundwork.wallMs++; return reports; }, 'v3');
    assert.throws(() => generateComparison(dir), /Inconsistent/);
    assert.equal(read(path.join(dir, 'README.md')), page);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('partial, wrong-revision and inconsistent v4 reports cannot update published pages', () => {
  const dir = fixture();
  try {
    seedAfter(dir);
    seedAfter(dir, undefined, 'v3');
    seedAfter(dir, undefined, 'v4');
    const pages = ['README.md', 'website/public/benchmarks.html'].map((file) => path.join(dir, file));
    const original = pages.map(read);
    rmSync(path.join(dir, 'bench/nav/v4/results/combined.json'));
    assert.throws(() => generateComparison(dir), /Both v4/);
    seedAfter(dir, (reports) => { reports[0].evidence.captures[0].captureRevision = ROUND2_REVISION; return reports; }, 'v4');
    assert.throws(() => generateComparison(dir), /v4 capture revision/);
    seedAfter(dir, (reports) => { reports[0].summary.groundwork.wallMs++; return reports; }, 'v4');
    assert.throws(() => generateComparison(dir), /Inconsistent/);
    seedAfter(dir, (reports) => { reports[0].summary.runs = 3; return reports; }, 'v4');
    assert.throws(() => generateComparison(dir), /eight-run/);
    assert.deepEqual(pages.map(read), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('interpretation calls out wins and losses only when intervals exclude zero', () => {
  const row = loadComparison().find((row) => row.experiment === 'round3');
  for (const [interval, output, wall] of [
    [{ median: 10, low: 1, high: 20 }, 'less output', 'faster execution'],
    [{ median: -10, low: -20, high: -1 }, 'more output', 'slower execution'],
    [{ median: 0, low: -1, high: 1 }, null, null],
    [{ median: 1, low: 0, high: 2 }, null, null],
  ]) {
    const summary = { ...row.summary, estimatedToolOutputReductionPct: interval, wallTimeReductionPct: interval };
    const content = sections([{ ...row, summary }]);
    for (const page of Object.values(content)) {
      if (output) {
        assert.ok(page.includes(`excludes zero toward ${output}`));
        assert.ok(page.includes(`excludes zero toward ${wall}`));
      } else assert.match(page, /includes zero \(no significant change under this analysis\)/);
    }
  }
});

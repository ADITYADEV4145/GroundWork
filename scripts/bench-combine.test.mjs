import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { combine, options, planArchive, validateCaptures } from './bench-combine.mjs';
import { options as experimentOptions } from './bench-combine-v2.mjs';
import { ROUND3_REVISION } from './bench-comparison.mjs';

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

test('v4 isolates nav3/lh3-named inputs and archives only after both graders succeed', (t) => {
  const root = new URL('../', import.meta.url).pathname;
  const dir = mkdtempSync(path.join(os.homedir(), 'bench-v4-combine-test-'));
  const scratch = new Set();
  try {
    const prior = [];
    const sources = [];
    for (const suite of ['nav', 'long-horizon']) {
      for (const version of ['', 'v2', 'v3']) {
        const report = path.join('bench', suite, version, 'results/combined.json');
        mkdirSync(path.dirname(path.join(dir, report)), { recursive: true });
        cpSync(path.join(root, report), path.join(dir, report));
        prior.push(path.join(dir, report));
      }
      cpSync(path.join(root, 'bench', suite, 'tasks.json'), path.join(dir, 'bench', suite, 'tasks.json'));
      const input = path.join(dir, suite + '-inputs');
      mkdirSync(input);
      for (const condition of ['baseline', 'groundwork']) for (let run = 1; run <= 8; run++) {
        const name = `${suite === 'nav' ? 'nav3' : 'lh3'}-${condition}-${run}.json`;
        const source = path.join(input, name);
        const capture = JSON.parse(readFileSync(path.join(root, 'bench', suite, 'observations', `${suite === 'nav' ? 'nav' : 'lh2'}-${condition}-${run}.json`), 'utf8'));
        capture.captureRevision = ROUND3_REVISION;
        writeFileSync(source, JSON.stringify(capture));
        sources.push({ suite, condition, run, source, bytes: readFileSync(source) });
      }
    }
    mkdirSync(path.join(dir, 'website/public'), { recursive: true });
    for (const file of ['README.md', 'website/public/benchmarks.html']) cpSync(path.join(root, file), path.join(dir, file));
    const before = prior.map((file) => readFileSync(file, 'utf8'));
    let failLh = true;
    t.mock.method(childProcess, 'execFileSync', (command, args, { cwd }) => {
      if (command === 'git') return ROUND3_REVISION + '\n';
      assert.equal(command, process.execPath);
      assert.equal(cwd, '/synthetic-round3-build');
      const suite = args[args.indexOf('--suite') + 1];
      const output = args[args.indexOf('--output-dir') + 1];
      scratch.add(path.dirname(output));
      if (suite === 'long-horizon' && failLh) throw new Error('synthetic grader failure');
      const reports = JSON.parse(readFileSync(path.join(dir, 'bench', suite, 'results/combined.json'), 'utf8'));
      for (const capture of reports[0].evidence.captures) capture.captureRevision = ROUND3_REVISION;
      mkdirSync(output);
      writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports));
      writeFileSync(path.join(output, 'report.md'), 'Synthetic report for orchestration tests only.\n');
      return 'synthetic grader completed';
    });
    t.mock.method(console, 'log', () => {});
    syncBuiltinESMExports();
    const config = { ...experimentOptions(['--experiment', 'v4', '--build', '/synthetic-round3-build',
      '--nav-captures', path.join(dir, 'nav-inputs'), '--lh-captures', path.join(dir, 'long-horizon-inputs')]), outputRoot: dir };
    assert.throws(() => combine(config), /synthetic grader failure/);
    assert.throws(() => readFileSync(path.join(dir, 'bench/nav/v4/results/combined.json')), /ENOENT/);
    assert.throws(() => readFileSync(path.join(dir, 'bench/nav/v4/observations/nav4-baseline-1.json')), /ENOENT/);
    failLh = false;
    combine(config);
    for (const { suite, condition, run, source, bytes } of sources) {
      const archive = path.join(dir, 'bench', suite, 'v4/observations', `${suite === 'nav' ? 'nav4' : 'lh4'}-${condition}-${run}.json`);
      assert.deepEqual(readFileSync(archive), bytes);
      assert.deepEqual(readFileSync(source), bytes);
    }
    for (const suite of ['nav', 'long-horizon']) {
      const report = JSON.parse(readFileSync(path.join(dir, 'bench', suite, 'v4/results/combined.json'), 'utf8'))[0];
      assert.equal(report.summary.runs, 8);
      assert.ok(report.evidence.captures.every((capture) => capture.captureRevision === ROUND3_REVISION));
    }
    assert.deepEqual(prior.map((file) => readFileSync(file, 'utf8')), before);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    rmSync(dir, { recursive: true, force: true });
    for (const folder of scratch) rmSync(folder, { recursive: true, force: true });
  }
});

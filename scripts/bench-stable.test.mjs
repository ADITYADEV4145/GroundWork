import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStable, historicalRows, loadV7, sections } from './bench-stable.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const reportFile = 'bench/HISTORICAL-SESSION-ANALYSIS.md';
const report = readFileSync(path.join(root, reportFile), 'utf8');
const read = (file) => readFileSync(file, 'utf8');
const strip = (s) => s.replace(/<!-- stable-protocol:start -->[\s\S]*?<!-- stable-protocol:end -->\n\n?/, '');

test('v7 stays wholly Pending and explains its estimands, timing limits and post-hoc distinction', () => {
  const { markdown, html } = sections(report);
  assert.equal([...html.matchAll(/<td>Pending<\/td>/g)].length, 8);
  for (const text of ['Stable protocol (v7)', 'session elapsed/task', 'bytes/session', 'tool-side ms/session', '95% whole-session bootstrap', '0x51ab17ed', '50%', '11%', 'Post-hoc', 'not v7', 'not billed model tokens', 'Old median task-window metrics remain secondary']) assert.ok(markdown.includes(text), text);
  assert.match(markdown, /not identified thinking\/provider latency/);
  assert.match(markdown, /CLI startup before dispatch/);
  assert.match(html, /role="region" aria-label="Stable protocol v7 pending results" tabindex="0"/);
  assert.match(html, /<th scope="col">/);
  assert.match(html, /<th scope="row">Navigation<\/th>/);
});

test('frozen historical means and reductions reconcile to all 192 archived captures', () => {
  let captures = 0;
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const [suite, round, elapsed, bytes, tools, success, guard] of historicalRows(report)) {
    const directory = path.join(root, 'bench', suite, round === 'original' ? '' : round);
    const raw = readdirSync(path.join(directory, 'observations')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read(path.join(directory, 'observations', f))));
    captures += raw.length;
    if (suite === 'long-horizon' && round === 'v6') {
      for (const [arm, rounded] of [['baseline', 50], ['groundwork', 11]]) {
        const sessions = raw.filter((c) => c.condition === arm);
        const timed = sessions.reduce((n, c) => n + c.observations.reduce((n, o) => n + o.wallMs, 0), 0);
        const envelope = sessions.reduce((n, c) => n + Math.max(...c.observations.map((o) => o.startedAt + o.wallMs)) - Math.min(...c.observations.map((o) => o.startedAt)), 0);
        assert.equal(Math.round(100 * (1 - timed / envelope)), rounded);
      }
    }
    for (const [cell, value] of [[elapsed, (c) => (Math.max(...c.observations.map((o) => o.startedAt + o.wallMs)) - Math.min(...c.observations.map((o) => o.startedAt))) / c.observations.length / 1000], [bytes, (c) => c.observations.reduce((n, o) => n + o.tools.reduce((n, t) => n + t.bytes, 0), 0)]]) {
      const b = raw.filter((c) => c.condition === 'baseline').map(value), g = raw.filter((c) => c.condition === 'groundwork').map(value);
      assert.equal(b.length, 8);assert.equal(g.length, 8);
      assert.ok(cell.startsWith(`${mean(b).toFixed(2)} → ${mean(g).toFixed(2)}; ${(100 * (1 - mean(g) / mean(b))).toFixed(1)}% [`), `${suite}/${round}: ${cell}`);
    }
    const { summary } = JSON.parse(read(path.join(directory, 'results/combined.json')))[0];
    assert.equal(success, `${summary.baseline.success}/${summary.baseline.attempts} / ${summary.groundwork.success}/${summary.groundwork.attempts}`);
    assert.equal(guard, summary.noSuccessDrop ? 'met' : 'NOT MET');
    assert.equal(tools, 'unavailable');
  }
  assert.equal(captures, 192);
});

test('empty, partial, duplicate and malformed historical reports fail closed', () => {
  assert.throws(() => historicalRows(''), /12 historical/);
  const lines = report.split('\n');
  const row = lines.findIndex((l) => l.startsWith('| nav | original'));
  assert.throws(() => historicalRows(lines.filter((_, i) => i !== row).join('\n')), /12 historical/);
  assert.throws(() => historicalRows([...lines, lines[row]].join('\n')), /Invalid historical/);
  assert.throws(() => historicalRows(report.replace('| unavailable |', '| 0 |')), /Invalid historical/);
});

test('generation is idempotent, preserves other content and validates both destinations before writing', () => {
  const dir = mkdtempSync(path.join(os.homedir(), 'bench-stable-publish-'));
  try {
    mkdirSync(path.join(dir, 'bench'));
    mkdirSync(path.join(dir, 'website/public'), { recursive: true });
    cpSync(path.join(root, reportFile), path.join(dir, reportFile));
    const files = ['README.md', 'website/public/benchmarks.html'];
    const original = 'before\n<!-- stable-protocol:start -->\nold\n<!-- stable-protocol:end -->\n| historical loss | -153.3% |\nafter\n';
    for (const file of files) writeFileSync(path.join(dir, file), original);
    generateStable(dir);
    const first = files.map((f) => read(path.join(dir, f)));
    for (const text of first) assert.equal(strip(text), strip(original));
    generateStable(dir);
    assert.deepEqual(files.map((f) => read(path.join(dir, f))), first);
    writeFileSync(path.join(dir, files[1]), 'missing markers');
    assert.throws(() => generateStable(dir), /markers/);
    assert.equal(read(path.join(dir, files[0])), first[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('saved sections are fresh, precede all old benchmark tables and preserve every previously published byte', () => {
  const content = sections(report, loadV7(root));
  for (const [file, section, oldStart] of [['README.md', content.markdown, 'Recorded pre-fix Devin-agent'], ['website/public/benchmarks.html', content.html, '<h2>Pre-fix results</h2>']]) {
    const page = read(path.join(root, file));
    const before = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' });
    assert.ok(page.includes(`<!-- stable-protocol:start -->\n${section}<!-- stable-protocol:end -->`));
    assert.ok(page.indexOf('<!-- stable-protocol:end -->') < page.indexOf(oldStart));
    assert.equal(strip(page), strip(before));
  }
});

test('completed v7 renders six primary intervals and rejects partial, wrong-pin and inconsistent reports', () => {
  const dir = mkdtempSync(path.join(os.homedir(), 'bench-v7-report-'));
  try {
    assert.equal(loadV7(dir), null);
    for (const suite of ['nav', 'long-horizon']) {
      const file = `bench/${suite}/v7/results/combined.json`;
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      cpSync(path.join(root, file), path.join(dir, file));
      if (suite === 'nav') assert.throws(() => loadV7(dir), /Both v7/);
    }
    const data = loadV7(dir), text = sections(report, data);
    assert.equal([...text.html.matchAll(/<td>met:/g)].length, 6);
    assert.doesNotMatch(text.html, /Pending/);
    assert.match(text.html, /inconclusive \(95% CI includes zero\)/);
    assert.match(text.html, /no confirmatory latency win/);
    const file = path.join(dir, 'bench/nav/v7/results/combined.json');
    const reportData = JSON.parse(read(file));
    reportData[0].evidence.captures[0].captureRevision = 'wrong';
    writeFileSync(file, JSON.stringify(reportData));
    assert.throws(() => loadV7(dir), /provenance/);
    cpSync(path.join(root, 'bench/nav/v7/results/combined.json'), file);
    const bad = JSON.parse(read(file));
    bad[0].summary.sessionPrimary.elapsedMsPerTask.baselineMean++;
    writeFileSync(file, JSON.stringify(bad));
    assert.throws(() => loadV7(dir), /Inconsistent/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

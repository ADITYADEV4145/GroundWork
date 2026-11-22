import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { aggregateReview, renderBlockReport, renderReview } from '../scripts/bench-v2-lib.js';
import type { BlockTask, Result, ReviewRow } from '../scripts/bench-v2-lib.js';
import { evaluateRealRepoReview, summarizeBlockReview } from '../src/selftest/real-repo-review.js';

const tasks: BlockTask[] = JSON.parse(readFileSync('bench/reuse-v2/block-tasks.json', 'utf8'));
const wave3File = 'bench/reuse-v2/block-tasks-wave3.json';
const wave3: BlockTask[] = JSON.parse(readFileSync(wave3File, 'utf8'));
const wave4File = 'bench/reuse-v2/block-tasks-wave4.json';
const wave4: BlockTask[] = JSON.parse(readFileSync(wave4File, 'utf8'));
const wave5File = 'bench/reuse-v2/block-tasks-wave5.json';
const wave5: BlockTask[] = JSON.parse(readFileSync(wave5File, 'utf8'));
const wave6File = 'bench/reuse-v2/block-tasks-wave6.json';
const wave6: BlockTask[] = JSON.parse(readFileSync(wave6File, 'utf8'));
const dirs: string[] = [];
const temp = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-block-v2-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const finding = { id: 'f', kind: 'duplicate' as const, severity: 'BLOCK' as const,
  added: { file: 'new.py', symbol: 'new', line: 1 }, existing: { file: 'old.py', symbol: 'old', line: 2 },
  probability: 0.99, signals: [{ name: 'structure', value: 1 }], fix: 'use existing' };
const result = (): Result => ({ suite: 'block-v2', task_kind: 'hard-negative', task_id: 'block-task', arm: 'baseline',
  session_id: '', acus: null, status: 'scored', success: null, acceptance: null,
  check: { status: 'BLOCK', findings: [finding] }, reuse: { label: 'unknown', reason: 'check-only', source: 'automated' } });
const reviewed = (): ReviewRow => ({ suite: 'reuse-v2', kind: 'duplicate', task_id: 'reuse-task', arm: 'baseline',
  added: finding.added, existing: finding.existing, probability: finding.probability, signals: finding.signals,
  verdict: 'agree', reviewer: 'Reviewer', reasoning: 'Equivalent behavior' });
const cli = (dir: string, args: string[] = []) => spawnSync(process.execPath,
  ['--import', 'tsx', 'scripts/bench-v2.ts', '--suite', 'block', '--runs', path.join(dir, 'runs'), '--out', dir, '--cache', path.join(dir, 'cache'), '--no-install', ...args],
  { encoding: 'utf8', timeout: 20_000 });

describe('BLOCK evidence task suite', () => {
  it('has 24 wrapper-only vendoring tasks and three behavioral negatives with unused targets', () => {
    const reuse = JSON.parse(readFileSync('bench/reuse-v2/tasks.json', 'utf8')) as { id: string; repo: string; helpers: { file: string; name: string }[] }[];
    const pins = JSON.parse(readFileSync('bench/real-repos/repos.json', 'utf8')).repositories as { id: string; url: string; end: string }[];
    const key = (repo: string, ref: { file: string; name: string }) => JSON.stringify([repo, ref.file, ref.name]);
    const prior = new Set([...tasks, ...wave3, ...wave4, ...wave5].map(t => key(t.repo, t.reference_symbol)));
    for (const task of reuse) for (const helper of task.helpers) prior.add(key(task.repo, helper));
    expect(wave6).toHaveLength(27);
    expect(['got', 'click', 'pytest'].map(repo => ['clone-prone', 'hard-negative'].map(kind => wave6.filter(t => t.repo === repo && t.kind === kind).length)))
      .toEqual([[0, 1], [12, 1], [12, 1]]);
    const all = [...reuse, ...tasks, ...wave3, ...wave4, ...wave5, ...wave6];
    expect(new Set(all.map(t => t.id)).size).toBe(all.length);
    expect(new Set(wave6.map(t => key(t.repo, t.reference_symbol))).size).toBe(27);
    const outputs = new Set<string>();
    for (const task of wave6) {
      const pin = pins.find(p => p.id === task.repo)!;
      expect([task.url, task.commit, task.wave, task.copy_inviting]).toEqual([pin.url, pin.end, 6, true]);
      expect(prior.has(key(task.repo, task.reference_symbol))).toBe(false);
      expect(task.reference_symbol.name).not.toContain('.');
      expect(task.vendoring).toBe(task.kind === 'clone-prone');
      expect(task.prompt).toContain('must remain importable by file path');
      expect(task.prompt).toContain('Do not import, subclass or call the original target');
      const output = /(?:new module |^Add )([^ ,]+)/.exec(task.prompt)![1]!;
      expect(output).not.toBe(task.reference_symbol.file);
      expect(outputs.has(output)).toBe(false);
      outputs.add(output);
      if (task.kind === 'clone-prone') {
        expect(task.prompt).toContain(`Vendor ${task.reference_symbol.name} from ${task.reference_symbol.file}`);
        expect(task.prompt).toContain("Keep the vendored function's body as-is");
        expect(task.prompt).toContain('separate small wrapper function in the same module');
        expect(task.prompt).toContain('Wrapper-only change:');
        expect(task.prompt).toContain('Support dependencies:');
      } else {
        expect(task.prompt).toContain(`${task.reference_symbol.file}::${task.reference_symbol.name}`);
        expect(task.prompt).toContain('no vendoring');
        expect(task.prompt).toContain('Required behavioral difference:');
      }
    }
  });
  it('has 33 standalone copy-inviting wave-5 tasks with unused targets and at least six got tasks', () => {
    const reuse = JSON.parse(readFileSync('bench/reuse-v2/tasks.json', 'utf8')) as { id: string; repo: string; helpers: { file: string; name: string }[] }[];
    const pins = JSON.parse(readFileSync('bench/real-repos/repos.json', 'utf8')).repositories as { id: string; url: string; end: string }[];
    const key = (repo: string, ref: { file: string; name: string }) => JSON.stringify([repo, ref.file, ref.name]);
    const prior = new Set([...tasks, ...wave3, ...wave4].map(t => key(t.repo, t.reference_symbol)));
    for (const task of reuse) for (const helper of task.helpers) prior.add(key(task.repo, helper));
    expect(wave5).toHaveLength(33);
    expect(wave5.filter(t => t.kind === 'clone-prone')).toHaveLength(30);
    expect(wave5.filter(t => t.kind === 'hard-negative')).toHaveLength(3);
    expect(['got', 'click', 'pytest'].map(repo => ['clone-prone', 'hard-negative'].map(kind => wave5.filter(t => t.repo === repo && t.kind === kind).length)))
      .toEqual([[6, 1], [12, 1], [12, 1]]);
    const all = [...reuse, ...tasks, ...wave3, ...wave4, ...wave5];
    expect(new Set(all.map(t => t.id)).size).toBe(all.length);
    expect(new Set(wave5.map(t => key(t.repo, t.reference_symbol))).size).toBe(33);
    const outputPaths = new Set<string>();
    for (const task of wave5) {
      const pin = pins.find(p => p.id === task.repo)!;
      expect([task.url, task.commit, task.wave, task.copy_inviting]).toEqual([pin.url, pin.end, 5, true]);
      expect(prior.has(key(task.repo, task.reference_symbol))).toBe(false);
      expect(task.prompt).toContain(`${task.reference_symbol.file}::${task.reference_symbol.name}`);
      expect(task.prompt).toContain('new standalone module');
      expect(task.prompt).toContain('must not import, subclass, or call the original');
      expect(task.prompt).toContain('must not import its defining module');
      expect(task.prompt).toMatch(/Reason: .+must stay importable without/);
      const output = /^Add ([^, ]+),/.exec(task.prompt)![1]!;
      expect(output).not.toBe(task.reference_symbol.file);
      expect(outputPaths.has(output)).toBe(false);
      outputPaths.add(output);
      if (task.kind === 'clone-prone') {
        expect(task.prompt).toContain('Copy and adapt');
        expect(task.prompt).toContain('Single tweak:');
      } else {
        expect(task.prompt).toContain('do not reproduce its behavior');
        expect(task.prompt).toContain('Required behavioral difference:');
      }
      expect(task).not.toHaveProperty('acceptance');
    }
  });
  it('has 60 wave-4 clone-prone tasks and four negatives with distinct references unused in waves 1–3', () => {
    const reuse = JSON.parse(readFileSync('bench/reuse-v2/tasks.json', 'utf8')) as { id: string; repo: string; helpers: { file: string; name: string }[] }[];
    const pins = JSON.parse(readFileSync('bench/real-repos/repos.json', 'utf8')).repositories as { id: string; url: string; end: string }[];
    const key = (repo: string, ref: { file: string; name: string }) => JSON.stringify([repo, ref.file, ref.name]);
    const prior = new Set([...tasks, ...wave3].map(t => key(t.repo, t.reference_symbol)));
    for (const task of reuse) for (const helper of task.helpers) prior.add(key(task.repo, helper));
    expect(wave4).toHaveLength(64);
    expect(wave4.filter(t => t.kind === 'clone-prone')).toHaveLength(60);
    expect(wave4.filter(t => t.kind === 'hard-negative')).toHaveLength(4);
    expect(['got', 'click', 'pytest'].map(repo => ['clone-prone', 'hard-negative'].map(kind => wave4.filter(t => t.repo === repo && t.kind === kind).length)))
      .toEqual([[0, 0], [60, 0], [0, 4]]);
    expect(new Set([...reuse, ...tasks, ...wave3, ...wave4].map(t => t.id)).size).toBe(reuse.length + tasks.length + wave3.length + wave4.length);
    expect(new Set(wave4.map(t => key(t.repo, t.reference_symbol))).size).toBe(64);
    for (const task of wave4) {
      const pin = pins.find(p => p.id === task.repo)!;
      expect([task.url, task.commit, task.wave]).toEqual([pin.url, pin.end, 4]);
      expect(prior.has(key(task.repo, task.reference_symbol))).toBe(false);
      expect(task.prompt).not.toMatch(/copy|reuse/i);
      expect(task.prompt).toContain(task.reference_symbol.name);
      expect(task).not.toHaveProperty('acceptance');
      if (task.kind === 'clone-prone') {
        expect(task.prompt).toContain('exactly like');
        expect(task.prompt).toContain('except');
        if (task.reference_symbol.name.includes('.')) expect(task.prompt).toContain('a new subclass of');
      }
    }
  });
  it('has 56 wave-3 tasks with distinct unused references and the approved repository distribution', () => {
    const reuse = JSON.parse(readFileSync('bench/reuse-v2/tasks.json', 'utf8')) as { id: string; repo: string; helpers: { file: string; name: string }[] }[];
    const pins = JSON.parse(readFileSync('bench/real-repos/repos.json', 'utf8')).repositories as { id: string; url: string; end: string }[];
    const referenceKey = (repo: string, ref: { file: string; name: string }) => JSON.stringify([repo, ref.file, ref.name]);
    const prior = new Set([...tasks.map(t => referenceKey(t.repo, t.reference_symbol)), ...reuse.flatMap(t => t.helpers.map(h => referenceKey(t.repo, h)))]);
    expect(wave3).toHaveLength(56);
    expect(wave3.filter(t => t.kind === 'clone-prone')).toHaveLength(50);
    expect(wave3.filter(t => t.kind === 'hard-negative')).toHaveLength(6);
    expect(['got', 'click', 'pytest'].map(repo => ['clone-prone', 'hard-negative'].map(kind => wave3.filter(t => t.repo === repo && t.kind === kind).length)))
      .toEqual([[3, 0], [23, 3], [24, 3]]);
    expect(new Set([...reuse, ...tasks, ...wave3].map(t => t.id)).size).toBe(reuse.length + tasks.length + wave3.length);
    expect(new Set(wave3.map(t => referenceKey(t.repo, t.reference_symbol))).size).toBe(56);
    for (const task of wave3) {
      const pin = pins.find(p => p.id === task.repo)!;
      expect([task.url, task.commit, task.wave]).toEqual([pin.url, pin.end, 3]);
      expect(prior.has(referenceKey(task.repo, task.reference_symbol))).toBe(false);
      expect(task.prompt).not.toMatch(/copy|reuse/i);
      expect(task.prompt).toContain(task.reference_symbol.name);
      expect(task.prompt).not.toContain(`Add ${task.reference_symbol.file} `);
      expect(task).not.toHaveProperty('acceptance');
      if (task.kind === 'clone-prone') expect(task.prompt).toContain('exactly like');
    }
  });
  it('has 16 distinct pinned tasks, 12 clone-prone and 4 negatives, without acceptance tests', () => {
    const reuse = JSON.parse(readFileSync('bench/reuse-v2/tasks.json', 'utf8')) as { id: string }[];
    const pins = JSON.parse(readFileSync('bench/real-repos/repos.json', 'utf8')).repositories as { id: string; url: string; end: string }[];
    expect(tasks).toHaveLength(16);
    expect(new Set([...tasks, ...reuse].map(t => t.id)).size).toBe(tasks.length + reuse.length);
    expect(tasks.filter(t => t.kind === 'clone-prone')).toHaveLength(12);
    expect(tasks.filter(t => t.kind === 'hard-negative')).toHaveLength(4);
    expect(['got', 'click', 'pytest'].map(repo => tasks.filter(t => t.repo === repo).length)).toEqual([6, 5, 5]);
    for (const task of tasks) {
      const pin = pins.find(p => p.id === task.repo)!;
      expect([task.url, task.commit]).toEqual([pin.url, pin.end]);
      expect(task.prompt).not.toMatch(/\b(copy|reuse)\b/i);
      expect(task.prompt).toContain(task.repo === 'got' ? 'source/' : 'src/');
      expect(task.reference_symbol.file).toBeTruthy();
      expect(task.reference_symbol.name).toBeTruthy();
      expect(task.why).toBeTruthy();
      expect(task).not.toHaveProperty('acceptance');
    }
  });
});

describe('suite-attributed shared BLOCK review', () => {
  it('discloses copy-inviting precision sampling even when no rows are present', () => {
    for (const rows of [[], [reviewed()]]) {
      expect(renderReview(rows)).toContain('Waves 5–6 are copy-inviting by design');
      expect(renderReview(rows)).toContain('precision on agent-made copies');
      expect(renderReview(rows)).toContain('hard negatives request behaviorally different code without vendoring');
      expect(renderReview(rows)).toContain('not natural duplicate incidence or task success');
    }
  });
  it('retains resolved historical disagreements but excludes them only after successful current scoring', () => {
    const row: ReviewRow = { ...reviewed(), suite: 'block-v2', task_id: result().task_id, verdict: 'disagree',
      resolved_by: { commit: 'a'.repeat(40), note: 'Correct generator argument count' } };
    const clean = { ...result(), check: { status: 'PASS', findings: [] } };
    expect(aggregateReview([clean], [row], 'block-v2')).toEqual([row]);
    expect(aggregateReview([result()], [row], 'block-v2')[0]).toEqual(row);
    expect(summarizeBlockReview([row])).toMatchObject({ reviewed: 1, agree: 0, resolvedRows: 0 });
    expect(summarizeBlockReview([row], [clean])).toMatchObject({ reviewed: 0, agree: 0, resolvedRows: 1, rawRows: 1, rawReviewed: 1 });
    expect(renderReview([row], [clean])).toContain(`1 false-positive rows excluded after detector fix ${'a'.repeat(40)}`);
    expect(renderReview([row], [clean])).toContain('Correct generator argument count');
    for (const scoring of [
      result(), { ...result(), check: { status: 'BLOCK', findings: [{ ...finding, added: { ...finding.added, line: 99 } }] } },
      { ...clean, status: 'execution_failed' as const }, { ...clean, check: { status: 'UNAVAILABLE', findings: [] } },
      { ...clean, task_id: 'other' }, { ...clean, arm: 'groundwork' as const }, { ...clean, suite: 'reuse-v2' as const },
    ]) expect(summarizeBlockReview([row], [scoring])).toMatchObject({ reviewed: 1, resolvedRows: 0 });
    expect(summarizeBlockReview([row], [clean, result()]).resolvedRows).toBe(0);
    expect(summarizeBlockReview([{ ...row, verdict: 'agree' }], [clean]).resolvedRows).toBe(0);
    expect(summarizeBlockReview([{ ...row, reviewer: null }], [clean]).resolvedRows).toBe(0);
    expect(summarizeBlockReview([], [clean])).toMatchObject({ reviewed: 0, resolvedRows: 0 });
  });
  it.each(['probability', 'signals', 'both'])('retains a returning resolved disagreement when %s change', change => {
    const row: ReviewRow = { ...reviewed(), suite: 'block-v2', task_id: result().task_id, verdict: 'disagree',
      resolved_by: { commit: 'a'.repeat(40), note: 'Correct generator argument count' } };
    const returned = { ...finding,
      probability: change === 'signals' ? row.probability : 0.9,
      signals: change === 'probability' ? row.signals : [{ name: 'bindingExact', value: 1 }] };
    const scoring = { ...result(), check: { status: 'BLOCK', findings: [returned] } };
    const rows = aggregateReview([scoring], [row], 'block-v2');
    expect(rows).toEqual([{ ...row, probability: returned.probability, signals: returned.signals }]);
    expect(summarizeBlockReview(rows, [scoring])).toMatchObject({ reviewed: 1, agree: 0, agreement: 0, pending: 0, resolvedRows: 0 });
    expect(summarizeBlockReview(rows, [{ ...scoring, check: { status: 'PASS', findings: [] } }])).toMatchObject({ reviewed: 0, resolvedRows: 1 });
    for (const different of [
      { ...returned, kind: 'grounding' as const },
      { ...returned, added: { ...returned.added, symbol: 'different' } },
      { ...returned, existing: { ...returned.existing!, symbol: 'different' } },
    ]) {
      const changed = aggregateReview([{ ...scoring, check: { status: 'BLOCK', findings: [different] } }], [row], 'block-v2');
      expect(changed).toHaveLength(2);
      expect(changed[1]).toMatchObject({ verdict: null, reviewer: null });
    }
  });
  it('loads current resolution evidence conservatively, including missing and malformed results', () => {
    const dir = temp(), row: ReviewRow = { ...reviewed(), suite: 'block-v2', task_id: result().task_id, verdict: 'disagree',
      resolved_by: { commit: 'b'.repeat(40), note: 'Fixed' } };
    const file = path.join(dir, 'block-review.json');
    writeFileSync(file, JSON.stringify([row]));
    const check = () => evaluateRealRepoReview(dir);
    expect(check().metrics).toMatchObject({ reviewed: 1, resolvedRows: 0 });
    const resultDir = path.join(dir, 'block-results', row.task_id);
    mkdirSync(resultDir, { recursive: true });
    const resultFile = path.join(resultDir, 'baseline.json');
    for (const text of ['{', '{}', JSON.stringify({ ...result(), check: { status: 'UNAVAILABLE', findings: [] } })]) {
      writeFileSync(resultFile, text);
      expect(check().metrics).toMatchObject({ reviewed: 1, resolvedRows: 0 });
    }
    writeFileSync(resultFile, JSON.stringify({ ...result(), check: { status: 'WARN', findings: [{ ...finding, severity: 'WARN' }] } }));
    expect(check().metrics).toMatchObject({ reviewed: 0, resolvedRows: 1 });
    expect(check().detail).toContain(`1 false-positive rows excluded after detector fix ${'b'.repeat(40)}`);
    writeFileSync(resultFile, JSON.stringify(result()));
    expect(check().metrics).toMatchObject({ reviewed: 1, resolvedRows: 0 });
    writeFileSync(file, JSON.stringify([{ ...row, resolved_by: { commit: 'not-a-sha', note: 'Fixed' } }]));
    expect(check().detail).toContain('Invalid BLOCK review evidence');
  });
  it('accepts agent review per Aditya and names the recorded reviewer without changing thresholds', () => {
    const dir = temp();
    const rows = Array.from({ length: 10 }, (_, i) => ({ ...reviewed(), added: { ...finding.added, symbol: `new${i}` },
      reviewer: 'Devin lead review (agent, not Aditya)', verdict: i ? 'agree' as const : 'disagree' as const }));
    const file = path.join(dir, 'block-review.json');
    writeFileSync(file, JSON.stringify(rows));
    const result = evaluateRealRepoReview(dir);
    expect(result.ok).toBe(true);
    for (const output of [result.detail, renderReview(rows)]) {
      expect(output).toContain("Agent review is accepted for this gate per Aditya's decision.");
      expect(output).toContain('Recorded reviewers: Devin lead review (agent, not Aditya).');
    }
    writeFileSync(file, JSON.stringify(rows.slice(1)));
    expect(evaluateRealRepoReview(dir).ok).toBe(false);
    writeFileSync(file, JSON.stringify(rows.map((r, i) => i < 2 ? { ...r, verdict: 'disagree' } : r)));
    expect(evaluateRealRepoReview(dir).ok).toBe(false);
  });
  it('preserves unselected-wave reviews while replacing selected-wave evidence, including unavailable checks', () => {
    const earlier: ReviewRow = { ...reviewed(), suite: 'block-v2', task_id: tasks[0]!.id };
    const selected: ReviewRow = { ...reviewed(), suite: 'block-v2', task_id: wave3[0]!.id };
    const ids = new Set([selected.task_id]);
    expect(aggregateReview([], [earlier, selected], 'block-v2', ids)).toEqual([earlier]);
    const unavailable = { ...result(), task_id: selected.task_id, check: { status: 'UNAVAILABLE', findings: [finding] } };
    expect(aggregateReview([unavailable], [earlier, selected], 'block-v2', ids)).toEqual([earlier]);
    expect(aggregateReview([], [earlier, selected], 'block-v2', new Set())).toEqual([earlier, selected]);
  });
  it('collects every BLOCK kind, not WARN or unavailable evidence, without assuming negatives are clean', () => {
    const run = result();
    run.check.findings.push({ ...finding, id: 'g', kind: 'grounding' }, { ...finding, id: 'w', severity: 'WARN' });
    const rows = aggregateReview([run], [reviewed()], 'block-v2');
    expect(rows.map(r => [r.suite, r.kind, r.verdict])).toEqual([
      ['reuse-v2', 'duplicate', 'agree'], ['block-v2', 'duplicate', null], ['block-v2', 'grounding', null],
    ]);
    expect(renderReview(rows)).toContain('block-v2');
    expect(aggregateReview([{ ...run, check: { ...run.check, status: 'UNAVAILABLE' } }], [], 'block-v2')).toEqual([]);
  });
  it('preserves the other suite and unchanged reviews, clears changed evidence and removes stale selected-suite rows', () => {
    const run = result(), reuse = reviewed();
    const block = { ...aggregateReview([run], [], 'block-v2')[0]!, verdict: 'disagree' as const, reviewer: 'Reviewer', reasoning: 'Different behavior' };
    expect(aggregateReview([run], [reuse, block], 'block-v2')).toEqual([reuse, block]);
    expect(aggregateReview([run], [reuse, { ...block, probability: 0.9 }], 'block-v2')[1]!.verdict).toBeNull();
    expect(aggregateReview([], [reuse, block], 'block-v2')).toEqual([reuse]);
    expect(aggregateReview([], [reuse, block])).toEqual([block]);
    const legacy = { ...reuse, suite: undefined, kind: undefined };
    const reuseRun = { ...run, task_id: reuse.task_id, suite: 'reuse-v2' as const };
    expect(aggregateReview([reuseRun], [legacy])[0]).toEqual(reuse);
    expect(aggregateReview([], [legacy], 'block-v2')).toEqual([legacy]);
  });
  it('accepts suite and kind provenance in the cheap gate without collapsing distinct findings', () => {
    const dir = temp();
    const rows = Array.from({ length: 10 }, (_, i) => ({ ...reviewed(), suite: i % 2 ? 'block-v2' : 'reuse-v2', task_id: `task${i}`, added: {...finding.added, symbol: `new${i}`} }));
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify(rows));
    expect(evaluateRealRepoReview(dir).ok).toBe(true);
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify([{ ...reviewed(), suite: 'unknown' }]));
    expect(evaluateRealRepoReview(dir).detail).toContain('Invalid BLOCK review evidence');
  });
  it('counts symbol pairs once, excluding covered file BLOCKs without removing their review rows', () => {
    const a = reviewed(), b = { ...reviewed(), added: { ...finding.added, file: 'other.py', symbol: 'other' } };
    const fileRow = (r: ReviewRow): ReviewRow => ({ ...r, kind: 'duplicate-file', added: { ...r.added, symbol: r.added.file, line: 1 },
      existing: { ...r.existing!, symbol: r.existing!.file, line: 1 } });
    const rows = [a, fileRow(a), b, fileRow(b)];
    const summary = summarizeBlockReview(rows);
    expect(summary).toMatchObject({ reviewed: 2, agree: 2, agreement: 1, pending: 0, rawRows: 4, rawReviewed: 4, coveredFileRows: 2, coveredNestedRows: 0 });
    expect(renderReview(rows)).toContain('2/2 distinct reviewed BLOCK pairs agree (100.0%)');
    expect(renderReview(rows)).toContain('Gate: FAIL; requires >=10 independent reviewed pairs');
    expect(rows).toHaveLength(4);
    const dir = temp();
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify(rows));
    expect(evaluateRealRepoReview(dir)).toMatchObject({ ok: false, metrics: summary });
    const repeated = Array.from({ length: 10 }, (_, i) => ({ ...a, task_id: `repeat${i}`, arm: i % 2 ? 'groundwork' as const : 'baseline' as const,
      added: { ...a.added, line: i + 1 } }));
    expect(summarizeBlockReview(repeated).reviewed).toBe(1);
    expect(summarizeBlockReview([...repeated, { ...a, verdict: 'disagree' }])).toMatchObject({ reviewed: 1, agree: 0 });
  });
  it('keeps standalone file reviews, and only reviewed symbol evidence covers a file pair', () => {
    const symbol = reviewed();
    const file: ReviewRow = { ...symbol, kind: 'duplicate-file', added: { ...symbol.added, symbol: symbol.added.file },
      existing: { ...symbol.existing!, symbol: symbol.existing!.file } };
    expect(summarizeBlockReview([file])).toMatchObject({ reviewed: 1, agree: 1, coveredFileRows: 0 });
    expect(summarizeBlockReview([file, { ...symbol, reviewer: null }])).toMatchObject({ reviewed: 1, pending: 1, coveredFileRows: 0 });
    expect(summarizeBlockReview([{ ...file, reviewer: null }, symbol])).toMatchObject({ reviewed: 1, pending: 0, rawReviewed: 1, coveredFileRows: 1 });
    expect(summarizeBlockReview([])).toMatchObject({ reviewed: 0, agree: 0, pending: 0, agreement: 0 });
  });
  it('excludes nested pairs only when reviewed enclosing symbols match on both sides and files', () => {
    const parent = reviewed();
    const nested: ReviewRow = { ...parent, added: { ...parent.added, symbol: `${parent.added.symbol}.inner` },
      existing: { ...parent.existing!, symbol: `${parent.existing!.symbol}.inner` } };
    expect(summarizeBlockReview([parent, nested])).toMatchObject({ reviewed: 1, agree: 1, coveredNestedRows: 1,
      symbolReviewed: 2, symbolAgree: 2 });
    expect(renderReview([parent, nested])).toContain('1/1 independent reviewed BLOCK pairs agree');
    expect(renderReview([parent, nested])).toContain('2/2 distinct reviewed BLOCK pairs agree');
    for (const other of [
      { ...parent, reviewer: null },
      { ...parent, added: { ...parent.added, file: 'other.py' } },
      { ...parent, existing: { ...parent.existing!, file: 'other.py' } },
      { ...parent, existing: { ...parent.existing!, symbol: 'unrelated' } },
      { ...parent, added: { ...parent.added, symbol: `${parent.added.symbol}Suffix` } },
    ]) expect(summarizeBlockReview([other, nested]).coveredNestedRows).toBe(0);
    expect(summarizeBlockReview([nested])).toMatchObject({ reviewed: 1, coveredNestedRows: 0 });
    expect(summarizeBlockReview([parent, { ...nested, verdict: null, reviewer: null, reasoning: null }])).toMatchObject({ reviewed: 1, pending: 0, coveredNestedRows: 1 });
    expect(summarizeBlockReview([parent, { ...nested, existing: null }])).toMatchObject({ reviewed: 2, coveredNestedRows: 0 });
    expect(summarizeBlockReview([parent, { ...nested, verdict: 'disagree', existing: { ...nested.existing!, symbol: 'wrong' } }])).toMatchObject({ reviewed: 2, agree: 1 });
  });
});

describe('check-only reports and CLI', () => {
  it('selects wave 6 with empty runs without acceptance setup or deleting earlier reviews', () => {
    const dir = temp(), earlier = reviewed();
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify([earlier]));
    const run = cli(dir, ['--tasks', wave6File, '--python', '/missing/python']);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'block-report.json'), 'utf8'))).toEqual({ schemaVersion: 1, suite: 'block-v2', mode: 'check-only', expectedTasks: 27, runs: [] });
    expect(JSON.parse(readFileSync(path.join(dir, 'block-review.json'), 'utf8'))).toEqual([earlier]);
    expect(existsSync(path.join(dir, 'cache/venv'))).toBe(false);
  });
  it('rejects missing or contradictory copy/vendoring metadata for wave 6', () => {
    const dir = temp(), file = path.join(dir, 'tasks.json');
    const clone = wave6.find(t => t.kind === 'clone-prone')!;
    const negative = wave6.find(t => t.kind === 'hard-negative')!;
    for (const task of [
      { ...clone, copy_inviting: undefined }, { ...clone, copy_inviting: false },
      { ...clone, vendoring: undefined }, { ...clone, vendoring: false },
      { ...negative, vendoring: undefined }, { ...negative, vendoring: true },
    ]) {
      writeFileSync(file, JSON.stringify([{ ...task, id: 'invalid-wave6-metadata' }]));
      const run = cli(dir, ['--tasks', file]);
      expect(run.status).toBe(1);
      expect(existsSync(path.join(dir, 'block-report.json'))).toBe(false);
    }
  });
  it('selects wave 5 through --tasks without acceptance setup or deleting earlier reviews', () => {
    const dir = temp(), earlier = reviewed();
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify([earlier]));
    const run = cli(dir, ['--tasks', wave5File, '--python', '/missing/python']);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'block-report.json'), 'utf8'))).toEqual({ schemaVersion: 1, suite: 'block-v2', mode: 'check-only', expectedTasks: 33, runs: [] });
    expect(JSON.parse(readFileSync(path.join(dir, 'block-review.json'), 'utf8'))).toEqual([earlier]);
    expect(existsSync(path.join(dir, 'cache/venv'))).toBe(false);
  });
  it('requires copy_inviting=true for wave 5', () => {
    const dir = temp(), file = path.join(dir, 'tasks.json');
    for (const copy_inviting of [undefined, false]) {
      writeFileSync(file, JSON.stringify([{ ...wave5[0], id: 'invalid-copy-inviting', copy_inviting }]));
      const run = cli(dir, ['--tasks', file]);
      expect(run.status).toBe(1);
      expect(existsSync(path.join(dir, 'block-report.json'))).toBe(false);
    }
  });
  it('selects wave 4 through --tasks while retaining earlier-wave reviews', () => {
    const dir = temp(), earlier = reviewed();
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify([earlier]));
    const run = cli(dir, ['--tasks', wave4File, '--python', '/missing/python']);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'block-report.json'), 'utf8'))).toEqual({ schemaVersion: 1, suite: 'block-v2', mode: 'check-only', expectedTasks: 64, runs: [] });
    expect(JSON.parse(readFileSync(path.join(dir, 'block-review.json'), 'utf8'))).toEqual([earlier]);
    expect(existsSync(path.join(dir, 'cache/venv'))).toBe(false);
  });
  it('selects wave 3 through --tasks without acceptance setup or deleting wave-2 reviews', () => {
    const dir = temp();
    const earlier: ReviewRow = { ...reviewed(), suite: 'block-v2', task_id: tasks[0]!.id };
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify([earlier]));
    const run = cli(dir, ['--tasks', wave3File, '--python', '/missing/python']);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'block-report.json'), 'utf8'))).toEqual({ schemaVersion: 1, suite: 'block-v2', mode: 'check-only', expectedTasks: 56, runs: [] });
    expect(JSON.parse(readFileSync(path.join(dir, 'block-review.json'), 'utf8'))).toEqual([earlier]);
    expect(existsSync(path.join(dir, 'cache/venv'))).toBe(false);
  });
  it('rejects invalid wave metadata and cross-wave task ID collisions', () => {
    const dir = temp(), file = path.join(dir, 'tasks.json');
    writeFileSync(file, JSON.stringify([{ ...wave3[0], id: 'invalid-wave', wave: 2 }]));
    expect(cli(dir, ['--tasks', file]).status).toBe(1);
    writeFileSync(file, JSON.stringify([{ ...wave3[0], id: 'invalid-field', acceptance: {} }]));
    expect(cli(dir, ['--tasks', file]).status).toBe(1);
    for (const id of [tasks[0]!.id, wave3[0]!.id, wave4[0]!.id, wave5[0]!.id, wave6[0]!.id]) {
      writeFileSync(file, JSON.stringify([{ ...wave3[0], id }]));
      const run = cli(dir, ['--tasks', file]);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('Task IDs must be distinct between suites');
    }
    writeFileSync(file, JSON.stringify([{ ...wave3[0], id: 'duplicated' }, { ...wave3[0], id: 'duplicated' }]));
    expect(cli(dir, ['--tasks', file]).stderr).toContain('Duplicate task IDs');
  });
  it('enforces wave-3 baseline arms and directory/run identity before cloning', () => {
    const dir = temp(), task = wave3[0]!;
    const runDir = path.join(dir, 'runs', task.id);
    mkdirSync(runDir, { recursive: true });
    const input = { task_id: task.id, arm: 'baseline', patch: '', decisions: [], notes: '', session_id: '', acus: null };
    const file = path.join(runDir, 'baseline.json');
    writeFileSync(file, JSON.stringify({ ...input, task_id: wave3[1]!.id }));
    expect(cli(dir, ['--tasks', wave3File]).stderr).toContain('Run identity mismatch');
    rmSync(file);
    writeFileSync(path.join(runDir, 'groundwork.json'), JSON.stringify({ ...input, arm: 'groundwork' }));
    expect(cli(dir, ['--tasks', wave3File]).stderr).toContain('BLOCK suite accepts baseline runs only');
  });
  it('reports unavailable checks as n/a, with no task-success inference and an explicit empty sample', () => {
    expect(renderBlockReport([], 16)).toContain('0/16 baseline runs scored');
    const unavailable = { ...result(), status: 'apply_failed' as const, check: { status: 'UNAVAILABLE', findings: [] } };
    const report = renderBlockReport([result(), unavailable], 16);
    expect(report).toContain('2/16 baseline runs scored; 1 GW checks UNAVAILABLE.');
    expect(report).toContain('acceptance and task success are not evaluated');
    expect(report).toContain('| apply_failed | UNAVAILABLE | n/a | n/a |');
    expect(report).toContain('| scored | BLOCK | 1 | 0 |');
  });
  it('loads the no-acceptance suite and keeps reuse results/report/reviews intact when no runs exist', () => {
    const dir = temp(), old = reviewed();
    writeFileSync(path.join(dir, 'report.json'), 'reuse report');
    writeFileSync(path.join(dir, 'labels.jsonl'), 'not a block-suite label');
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify([old]));
    const run = cli(dir, ['--python', '/missing/python']);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'block-report.json'), 'utf8'))).toEqual({ schemaVersion: 1, suite: 'block-v2', mode: 'check-only', expectedTasks: 16, runs: [] });
    expect(readFileSync(path.join(dir, 'report.json'), 'utf8')).toBe('reuse report');
    expect(JSON.parse(readFileSync(path.join(dir, 'block-review.json'), 'utf8'))).toEqual([old]);
    expect(existsSync(path.join(dir, 'cache/venv'))).toBe(false);
  });
  it('rejects treatment-arm inputs and cross-suite task ID collisions before cloning', () => {
    const dir = temp(), task = tasks[0]!;
    const runDir = path.join(dir, 'runs', task.id);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(path.join(runDir, 'groundwork.json'), JSON.stringify({ task_id: task.id, arm: 'groundwork', patch: '', decisions: [], notes: '', session_id: '', acus: null }));
    const run = cli(dir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('BLOCK suite accepts baseline runs only');
    const reuse = JSON.parse(readFileSync('bench/reuse-v2/tasks.json', 'utf8')) as { id: string }[];
    const file = path.join(dir, 'tasks.json');
    writeFileSync(file, JSON.stringify([{ ...task, id: reuse[0]!.id }]));
    const collision = cli(dir, ['--tasks', file]);
    expect(collision.status).toBe(1);
    expect(collision.stderr).toContain('Task IDs must be distinct between suites');
  });
});

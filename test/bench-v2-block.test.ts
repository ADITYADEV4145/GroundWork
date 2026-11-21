import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { aggregateReview, renderBlockReport, renderReview } from '../scripts/bench-v2-lib.js';
import type { BlockTask, Result, ReviewRow } from '../scripts/bench-v2-lib.js';
import { evaluateRealRepoReview } from '../src/selftest/real-repo-review.js';

const tasks: BlockTask[] = JSON.parse(readFileSync('bench/reuse-v2/block-tasks.json', 'utf8'));
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
    const rows = Array.from({ length: 10 }, (_, i) => ({ ...reviewed(), suite: i % 2 ? 'block-v2' : 'reuse-v2', task_id: `task${i}` }));
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify(rows));
    expect(evaluateRealRepoReview(dir).ok).toBe(true);
    writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify([{ ...reviewed(), suite: 'unknown' }]));
    expect(evaluateRealRepoReview(dir).detail).toContain('Invalid BLOCK review evidence');
  });
});

describe('check-only reports and CLI', () => {
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

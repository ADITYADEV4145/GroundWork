import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { addedLines, aggregateReview, applyOverride, labelReuse, newcombe, renderReport, renderReview, summarize, wilson } from '../scripts/bench-v2-lib.js';
import type { Result, ReviewRow, Task } from '../scripts/bench-v2-lib.js';
import { evaluateBenchmarkV2, evaluateRealRepoReview } from '../src/selftest/real-repo-review.js';
import { PHASE3_CHECKS } from '../src/selftest/checks/phase3.js';

const dirs: string[] = [];
const temp = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-bench-v2-test-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const task = { helpers: [{file: 'src/pkg/utils.py', name: 'existing'}] } as Task;
const result = (arm: 'baseline' | 'groundwork' = 'baseline'): Result => ({ task_id: 'task', arm, session_id: 'session', acus: null,
  status: 'scored', success: true, acceptance: { exitCode: 0, output: 'passed' }, check: { status: 'PASS', findings: [] },
  reuse: { label: 'reused', source: 'automated', reason: 'call' } });
const finding = { id: 'f', kind: 'duplicate' as const, severity: 'BLOCK' as const,
  added: { file: 'src/new.py', symbol: 'new', line: 1 }, existing: { file: 'src/old.py', symbol: 'old', line: 2 },
  probability: 0.99, signals: [{ name: 'exact', value: 1 }], fix: 'reuse' };
const row = (): ReviewRow => ({ suite: 'reuse-v2', kind: 'duplicate', task_id: 'task', arm: 'baseline', added: finding.added, existing: finding.existing,
  probability: finding.probability, signals: finding.signals, verdict: 'agree', reviewer: 'Human', reasoning: 'same behavior' });

describe('Benchmark v2 intervals', () => {
  it('matches published Wilson examples and handles boundary/empty samples', () => {
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(5, 10)!.low).toBeCloseTo(0.236593, 5);
    expect(wilson(5, 10)!.high).toBeCloseTo(0.763407, 5);
    expect(wilson(0, 10)!.high).toBeCloseTo(0.277533, 5);
    expect(wilson(10, 10)!.low).toBeCloseTo(0.722467, 5);
    expect(() => wilson(2, 1)).toThrow();
    expect(() => wilson(-1, 2)).toThrow();
    expect(() => wilson(0.5, 1)).toThrow();
  });
  it('uses Newcombe root-sum-square bounds, not subtraction of endpoints', () => {
    const ci = newcombe(10, 10, 0, 10)!;
    expect(ci.low).toBeCloseTo(1 - Math.SQRT2 * 0.2775328, 6);
    expect(ci.high).toBe(1);
    const reverse = newcombe(0, 10, 10, 10)!;
    expect(reverse.low).toBe(-ci.high); expect(reverse.high).toBeCloseTo(-ci.low);
    const equal = newcombe(5, 10, 5, 10)!;
    expect(equal.low).toBeCloseTo(-equal.high);
    expect(newcombe(0, 0, 1, 1)).toBeNull();
  });
});

describe('reuse call heuristics', () => {
  const python = (source: string, file = 'src/pkg/new.py') => labelReuse(task, [{file, source, addedLines: new Set(source.split('\n').map((_, i) => i + 1))}]);
  it('resolves Python direct, aliased and namespace imports', () => {
    expect(python('from .utils import existing as reuse\ndef work():\n    return reuse(3)\n').label).toBe('reused');
    expect(python('from pkg.utils import existing\ndef work():\n    return existing(3)\n').label).toBe('reused');
    expect(python('import pkg.utils as util\ndef work():\n    return util.existing(3)\n').label).toBe('reused');
  });
  it('does not trust comments, decisions, imports alone or unrelated same-name calls', () => {
    expect(python('from .utils import existing\n# existing(1)\ndef work(x):\n    return x + 1\n').label).toBe('duplicate');
    expect(python('from other import existing\ndef work():\n    return existing(1)\n').label).toBe('duplicate');
    expect(python('from .utils import existing\n').label).toBe('unknown');
    expect(labelReuse(task, []).label).toBe('unknown');
    expect(python('def work():\n    return 1\n', 'tests/new.py').label).toBe('unknown');
    expect(labelReuse(task, [{ file: 'src/pkg/new.py', source: 'from .utils import existing\nexisting(1)', addedLines: new Set([1]) }]).label).toBe('unknown');
    expect(labelReuse(task, [{ file: 'src/pkg/new.py', source: 'x=1', addedLines: new Set([1]) }], '/missing/python').label).toBe('unknown');
  });
  it('resolves TypeScript aliases and ignores string/comment references', () => {
    const tsTask = { helpers: [{file: 'source/utils.ts', name: 'existing'}] } as Task;
    const classify = (source: string) => labelReuse(tsTask, [{ file: 'source/new.ts', source, addedLines: new Set([1, 2]) }]);
    expect(classify("import {existing as reuse} from './utils.js';\nexport const run = () => reuse(1);").label).toBe('reused');
    expect(classify("import reuse from './utils.js';\nexport const run = () => reuse(1);").label).toBe('reused');
    expect(classify("import * as util from './utils.js';\nexport const run = () => util.existing(1);").label).toBe('reused');
    expect(classify("// existing(1)\nexport const text = 'existing(1)';").label).toBe('duplicate');
    expect(classify("import {existing} from './other.js';\nexisting(1);").label).toBe('duplicate');
    expect(classify("import type {existing} from './utils.js';\nexport const x = 1;").label).toBe('duplicate');
  });
  it('human overrides take precedence with attribution', () => {
    const automatic = python('def f():\n    return 1');
    expect(applyOverride(automatic)).toEqual(automatic);
    expect(applyOverride(automatic, {task_id: 'task', arm: 'baseline', label: 'reused', reviewer: 'Jane', reasoning: 'indirect call checked'}))
      .toEqual({label: 'reused', source: 'human', reason: 'Jane: indirect call checked'});
  });
  it('tracks only newly added patch line numbers', () => {
    const files = addedLines('--- a/src/a.py\n+++ b/src/a.py\n@@ -1,2 +1,3 @@\n context\n-old\n+new\n+other\n');
    expect([...files.get('src/a.py')!]).toEqual([2, 3]);
    expect(addedLines('')).toEqual(new Map());
  });
});

describe('BLOCK review aggregation', () => {
  it('collects duplicate kinds only, preserves reviews, clears changed evidence, removes stale rows', () => {
    const r = result();
    r.check = {status: 'BLOCK', findings: [finding, {...finding, id: 'w', severity: 'WARN'}, {...finding, id: 'g', kind: 'grounding'}]};
    expect(aggregateReview([r], [row()])).toEqual([row()]);
    expect(aggregateReview([r], [])[0]!.verdict).toBeNull();
    const changed = {...row(), probability: 0.5};
    expect(aggregateReview([r], [changed])[0]!.verdict).toBeNull();
    expect(aggregateReview([], [row()])).toEqual([]);
    for (const kind of ['duplicate-file', 'duplicate-constant'] as const) {
      r.check.findings = [{...finding, kind}]; expect(aggregateReview([r], []).length).toBe(1);
    }
    expect(renderReview([row()])).toContain('1/1 reviewed agree (100.0%)');
    expect(renderReview([{...row(), reviewer: null}])).toContain('0/0 reviewed agree (n/a)');
    expect(renderReview([])).toContain('0 pending');
  });
});

describe('reports and cheap acceptance gates', () => {
  it('counts failures, unknown labels, unavailable checks and ACUs without fabricating zeros', () => {
    const a = result(), b = result('groundwork');
    a.reuse.label = 'duplicate'; a.acus = 2; a.check.findings = [finding];
    const failed = {...result(), success: false, status: 'apply_failed' as const, check: {status: 'UNAVAILABLE', findings: []}, reuse: {label: 'unknown' as const, reason: 'failed', source: 'automated' as const}};
    const report = summarize([a, b, failed]);
    expect(report.arms.baseline.n).toBe(2);
    expect(report.arms.baseline.success.rate).toBe(0.5);
    expect(report.arms.baseline.duplicates.rate).toBe(1);
    expect(report.arms.baseline.unknownLabels).toBe(1);
    expect(report.arms.baseline.check).toEqual({BLOCK: 1, WARN: 0, unavailable: 1});
    expect(report.arms.baseline.acus).toEqual({mean: 2, n: 1});
    expect(report.arms.groundwork.acus.mean).toBeNull();
    expect(report.differences.success.estimate).toBe(-0.5);
    expect(renderReport(report)).toContain('Mean ACUs');
    expect(summarize([]).differences.duplicates.ci).toBeNull();
  });
  it('skips only missing files; empty, insufficient and malformed evidence does not pass', () => {
    expect(summarize([]).arms.baseline.reviewedLabels).toBe(0);
    const dir = temp();
    expect(evaluateRealRepoReview(dir).skipped).toBe(true);
    expect(evaluateBenchmarkV2(dir).skipped).toBe(true);
    writeFileSync(path.join(dir, 'block-review.json'), '[]');
    expect(evaluateRealRepoReview(dir).ok).toBe(false);
    writeFileSync(path.join(dir, 'block-review.json'), '{');
    expect(evaluateRealRepoReview(dir).ok).toBe(false);
    writeFileSync(path.join(dir, 'report.json'), JSON.stringify(summarize([])));
    expect(evaluateBenchmarkV2(dir).ok).toBe(false);
    writeFileSync(path.join(dir, 'report.json'), '{}');
    expect(evaluateBenchmarkV2(dir).ok).toBe(false);
  });
  it('attributes reviewed overrides separately from automated labels without asserting human review', () => {
    const run = result();
    expect(summarize([run]).arms.baseline.reviewedLabels).toBe(0);
    run.reuse = applyOverride(run.reuse, { task_id: run.task_id, arm: run.arm, label: 'reused', reviewer: 'Agent', reasoning: 'Calls helper.' });
    const report = summarize([run]);
    expect(report.arms.baseline.reviewedLabels).toBe(1);
    expect(renderReport(report)).toContain('baseline 1/1; groundwork 0/0');
    expect(renderReport(report)).toContain('agent review is not independent human review');
  });
  it('requires ten attributed reviews and >=90% agreement, rejecting duplicate rows', () => {
    const dir = temp();
    const rows = Array.from({length: 10}, (_, i) => ({...row(), task_id: `task${i}`, verdict: i === 0 ? 'disagree' : 'agree'}));
    const save = (value: unknown) => writeFileSync(path.join(dir, 'block-review.json'), JSON.stringify(value));
    save(rows); expect(evaluateRealRepoReview(dir).ok).toBe(true);
    save(rows.slice(1)); expect(evaluateRealRepoReview(dir).ok).toBe(false);
    rows[1]!.verdict = 'disagree'; save(rows); expect(evaluateRealRepoReview(dir).ok).toBe(false);
    save([...rows, rows[0]]); expect(evaluateRealRepoReview(dir).detail).toContain('duplicate');
    save(rows.map(r => ({...r, reviewer: ''}))); expect(evaluateRealRepoReview(dir).ok).toBe(false);
  });
  it('gates strict duplicate reduction and nondecreasing success point estimates', () => {
    const dir = temp(), a = result(), b = result('groundwork'); a.reuse.label = 'duplicate';
    const save = (results: Result[]) => writeFileSync(path.join(dir, 'report.json'), JSON.stringify(summarize(results)));
    save([a,b]); expect(evaluateBenchmarkV2(dir).ok).toBe(true);
    b.success = false; save([a,b]); expect(evaluateBenchmarkV2(dir).ok).toBe(false);
    b.success = true; b.reuse.label = 'duplicate'; save([a,b]); expect(evaluateBenchmarkV2(dir).ok).toBe(false);
    b.reuse.label = 'unknown'; save([a,b]); expect(evaluateBenchmarkV2(dir).ok).toBe(false);
    expect(PHASE3_CHECKS.filter(c => /BLOCK agreement|Benchmark v2:/.test(c.name)).every(c => !c.slow)).toBe(true);
  });
  it('CLI produces a well-formed empty report without setup/networking', () => {
    const dir = temp();
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bench-v2.ts', '--runs', path.join(dir, 'missing'), '--out', dir, '--no-install'], {encoding: 'utf8', timeout: 20_000});
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'report.json'), 'utf8')).arms.baseline.n).toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, 'block-review.json'), 'utf8'))).toEqual([]);
  });
});

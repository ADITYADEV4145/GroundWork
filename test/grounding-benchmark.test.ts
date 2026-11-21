import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataRoot, filesUnder, tasks, taskSetHash, type Arm, type Task } from '../src/bench/grounding/tasks.js';
import { commit, git, materialize, prepare, protocol } from '../src/bench/grounding/workspaces.js';
import { incidentKeys, score, scoreTask, type ArmResults, type TaskRow } from '../src/bench/grounding/score.js';
import { bootstrap, makeReport, validateArm, validateStoredResults, wilson, writeReport } from '../src/bench/grounding/report.js';
import { PHASE4_CHECKS } from '../src/selftest/checks/phase4.js';

const dirs: string[] = [];
const temp = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'gw-v3-test-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const task = (id: string) => tasks().find((t) => t.id === id)!;
function workspace(t: Task, feedback = false) {
  const dir = path.join(temp(), t.id);
  materialize(t, dir);
  if (feedback) { mkdirSync(path.join(dir, '.benchmark')); writeFileSync(path.join(dir, '.benchmark/feedback.jsonl'), ''); }
  git(dir, 'init', '-q');
  git(dir, 'add', '--', ...filesUnder(path.join(dataRoot, 'repos', t.repo)), ...(feedback ? ['.benchmark/feedback.jsonl'] : []));
  commit(dir, 'benchmark: initial task');
  return { dir, base: git(dir, 'rev-parse', 'HEAD') };
}
function step(dir: string, file: string, content: string, feedback?: string) {
  writeFileSync(path.join(dir, file), content);
  if (feedback !== undefined) {
    const log = path.join(dir, '.benchmark/feedback.jsonl');
    writeFileSync(log, readFileSync(log, 'utf8') + JSON.stringify({ base: git(dir, 'rev-parse', 'HEAD'), files: [file], stdout: feedback, stderr: '', status: feedback ? 1 : 0 }) + '\n');
  }
  git(dir, 'add', '--', file, ...(feedback !== undefined ? ['.benchmark/feedback.jsonl'] : []));
  commit(dir, 'step: implement workflow');
}
const reference = (t: Task) => readFileSync(path.join(dataRoot, 'reference', t.repo + (t.repo === 'dispatch-desk' ? '.py.txt' : '.ts.txt')), 'utf8');

describe('Benchmark v3 preparation and inputs', () => {
  it('has 15 unique tasks, five per repo, with natural prompts and private truth', () => {
    expect(tasks()).toHaveLength(15);
    for (const t of tasks()) {
      expect(protocol(t, 'baseline')).not.toMatch(/groundwork|\.tools|grounding/i);
      expect(protocol(t, 'groundwork')).toContain('node .benchmark/check.mjs');
      for (const s of t.symbols) expect(t.prompt).not.toMatch(new RegExp(`\\b${s.split('#')[1]!.split('.').at(-1)!}\\b`));
    }
  });
  it('prepares only fixture files, task protocol and git metadata, and rejects overwrites', () => {
    const out = path.join(temp(), 'baseline');
    const run = prepare('baseline', 'customer-desk', out);
    expect(run.workspaces).toHaveLength(5);
    const dir = path.join(out, 'customer-welcome');
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'ls-files')).not.toMatch(/reference|hidden|tasks\.json|\.tools/);
    expect(existsSync(path.join(dir, '.tools'))).toBe(false);
    expect(readFileSync(path.join(dir, 'TASKS.md'), 'utf8')).not.toMatch(/groundwork|grounding/i);
    expect(() => prepare('baseline', 'customer-desk', out)).toThrow(/already exist/);
    expect(() => prepare('groundwork', 'parcel-ops', out)).toThrow(/different arm/);
    expect(() => prepare('baseline', 'nope', temp())).toThrow(/Unknown repo/);
  });
  it('hashes hidden tests, reference solutions and fixtures as well as prompts', () => {
    const root = path.join(temp(), 'data'); cpSync(dataRoot, root, { recursive: true });
    const before = taskSetHash(root);
    writeFileSync(path.join(root, 'reference/customer-desk.ts.txt'), reference(task('customer-welcome')) + '\n');
    expect(taskSetHash(root)).not.toBe(before);
  });
});

describe('Benchmark v3 commit-history scoring', () => {
  it.each([
    ['getUserByEmail(users, renderWelcome(email, locale), true)', 'getUserByEmail'],
    ['getUserByEmail(users, email, renderWelcome(email, locale))', 'getUserByEmail'],
    ['getUserByEmail(users, renderWelcome(email))', 'renderWelcome'],
    ['getUserByEmail(\n    users,\n    renderWelcome(email, locale),\n    true\n  )', 'getUserByEmail'],
  ])('attributes nested arity diagnostic %s to its owning call site', async (expression, name) => {
    const t = task('customer-welcome'), { dir, base } = workspace(t);
    step(dir, t.target, reference(t).replace('getUserByEmail(users, email)', expression));
    const row = await scoreTask(t, dir, base);
    expect(row.wrongCallsFinal).toBe(1);
    expect(row.errors[0]).toMatchObject({ name, kind: 'arity', evidence: expect.arrayContaining(['grounding', 'compiler']) });
  });
  it.each([
    ['render_receipt(get_primary_email(customer), total, True)', 'render_receipt', 'arity'],
    ['render_receipt(get_primary_email(customer), total, bogus=True)', 'render_receipt', 'unknown-keyword'],
    ['render_receipt(get_primary_email(customer, True), total)', 'get_primary_email', 'arity'],
  ])('maps Python nested call %s to its named failing callee', async (expression, name, kind) => {
    const t = task('dispatch-receipt'), { dir, base } = workspace(t);
    step(dir, t.target, reference(t).replace('render_receipt(get_primary_email(customer), total)', expression));
    const row = await scoreTask(t, dir, base);
    expect(row.wrongCallsFinal).toBe(1);
    expect(row.errors[0]).toMatchObject({ name, kind, evidence: expect.arrayContaining(['grounding', 'runtime']) });
  });
  it('counts and tracks two same-name erroneous calls on one line independently', async () => {
    const t = task('customer-welcome'), { dir, base } = workspace(t);
    const original = readFileSync(path.join(dir, t.target), 'utf8');
    step(dir, t.target, original.replace("throw new Error('Not implemented');", 'findByEmail(users, email); return findByEmail(users, email);'));
    const broken = await scoreTask(t, dir, base);
    expect(broken.wrongCallsFinal).toBe(2);
    expect(new Set(incidentKeys(broken.errors)).size).toBe(2);
    step(dir, t.target, reference(t));
    const repaired = await scoreTask(t, dir, base);
    expect(repaired.success).toBe(true);
    expect(repaired.fixes).toHaveLength(1);
    expect(repaired.fixes[0]!.errors).toHaveLength(2);
  });
  it('deduplicates compiler and grounding evidence by call column, not by line', async () => {
    const t = task('customer-welcome'), { dir, base } = workspace(t);
    step(dir, t.target, reference(t).replace('const user = getUserByEmail(users, email);',
      'getUserByEmail(users, email, true); const user = getUserByEmail(users, email, true);'));
    const row = await scoreTask(t, dir, base);
    expect(row.wrongCallsFinal).toBe(2);
    expect(new Set(row.errors.map((e) => e.column)).size).toBe(2);
    expect(row.errors.every((e) => e.evidence.includes('compiler') && e.evidence.includes('grounding'))).toBe(true);
  });
  it('counts two Python AST call sites without double-counting runtime evidence', async () => {
    const t = task('dispatch-cancelled'), { dir, base } = workspace(t);
    step(dir, t.target, reference(t).replace('return sorted(o.reference for o in list_orders(orders, customer_id, include_cancelled=True) if o.cancelled)',
      'get_orders(orders); return get_orders(orders)'));
    const row = await scoreTask(t, dir, base);
    expect(row.wrongCallsFinal).toBe(2);
    expect(new Set(row.errors.map((e) => e.column)).size).toBe(2);
    expect(row.errors.every((e) => e.evidence.includes('python-ast'))).toBe(true);
    expect(row.hiddenFailuresCaused).toBe(4);
  });
  it('scores an unchanged repo as unsuccessful with zero invented calls, not a missing task', async () => {
    const t = task('customer-welcome'), { dir, base } = workspace(t);
    const row = await scoreTask(t, dir, base);
    expect(row.success).toBe(false);
    expect(row.steps).toBe(0);
    expect(row.wrongCallsFinal).toBe(0);
    expect(row.hiddenFailuresCaused).toBe(0);
    expect(row.fixTokensProxy).toBe(0);
  });
  it('counts an invented call introduced then fixed and charges source diff plus matching feedback once', async () => {
    const t = task('customer-welcome'), { dir, base } = workspace(t, true);
    const original = readFileSync(path.join(dir, t.target), 'utf8');
    step(dir, t.target, original.replace("throw new Error('Not implemented');", "return findByEmail(users, email);"), 'findByEmail is not defined');
    const broken = git(dir, 'rev-parse', 'HEAD');
    step(dir, t.target, reference(t), '');
    const row = await scoreTask(t, dir, base, dataRoot, true);
    expect(row.success).toBe(true);
    expect(row.wrongCallsFinal).toBe(0);
    expect(row.hiddenFailuresCaused).toBe(0);
    expect(row.fixes).toHaveLength(1);
    expect(row.fixes[0]!.errors).toHaveLength(1);
    const diff = execFileSync('git', ['diff', '--no-ext-diff', '--no-color', '--unified=0', broken, 'HEAD', '--', '*.ts', '*.py'], { cwd: dir, encoding: 'utf8' });
    expect(row.fixes[0]!.diffChars).toBe(diff.length);
    expect(row.fixes[0]!.feedbackChars).toBe('findByEmail is not defined'.length);
    expect(row.fixTokensProxy).toBe((diff.length + 'findByEmail is not defined'.length) / 4);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });
  it('cross-checks a final invented export against compiler and hidden runtime failures', async () => {
    const t = task('customer-welcome'), { dir, base } = workspace(t);
    const original = readFileSync(path.join(dir, t.target), 'utf8');
    step(dir, t.target, "import { findByEmail } from './users.ts';\n" + original.replace("throw new Error('Not implemented');", 'return findByEmail(users, email);'));
    const row = await scoreTask(t, dir, base);
    expect(row.success).toBe(false);
    expect(row.wrongCallsFinal).toBe(1);
    expect(row.errors[0]!.name).toBe('findByEmail');
    expect(row.errors[0]!.evidence).toContain('compiler');
    expect(row.hiddenFailuresCaused).toBe(5);
  });
  it('counts a Python keyword mistake once across grounding and runtime evidence', async () => {
    const t = task('dispatch-cancelled'), { dir, base } = workspace(t);
    step(dir, t.target, reference(t).replace('include_cancelled=True', 'with_cancelled=True')
      .replace('return sorted(o.reference', 'list_orders(orders, customer_id); return sorted(o.reference'));
    const row = await scoreTask(t, dir, base);
    expect(row.success).toBe(false);
    expect(row.wrongCallsFinal).toBe(1);
    expect(row.errors[0]!.kind).toBe('unknown-keyword');
    expect(row.errors[0]!.evidence).toEqual(expect.arrayContaining(['grounding', 'runtime']));
    expect(row.hiddenFailuresCaused).toBe(4);
  });
  it('does not invent unknown bare-call findings for valid Python star imports', async () => {
    const t = task('dispatch-cancelled'), { dir, base } = workspace(t);
    step(dir, t.target, reference(t).replace('from .orders import list_orders, get_order', 'from .orders import *'));
    const row = await scoreTask(t, dir, base);
    expect(row.success).toBe(true);
    expect(row.wrongCallsFinal).toBe(0);
  });
  it('identifies a wrong but valid sibling only when a ground-truth substitution repairs acceptance', async () => {
    const t = task('customer-contact'), { dir, base } = workspace(t);
    const original = readFileSync(path.join(dir, t.target), 'utf8');
    const bad = "import { readBillingPolicy } from './policies.ts';\nimport { getPrimaryAddress } from './addresses.ts';\n" + original.replace(
      "export function contactableAddresses(users: User[], policies: Policy[]): string[] { throw new Error('Not implemented'); }",
      'export function contactableAddresses(users: User[], policies: Policy[]): string[] { return users.filter(u => readBillingPolicy(policies, u.id)).map(getPrimaryAddress).sort(); }');
    step(dir, t.target, bad);
    const row = await scoreTask(t, dir, base);
    expect(row.wrongCallsFinal).toBe(1);
    expect(row.errors[0]!.kind).toBe('wrong-sibling');
    expect(row.hiddenFailuresCaused).toBe(4);
  });
  it('rejects dirty source, modified fixture services, missing treatment feedback and partial arms', async () => {
    const t = task('customer-welcome'), { dir, base } = workspace(t);
    writeFileSync(path.join(dir, t.target), reference(t));
    await expect(scoreTask(t, dir, base)).rejects.toThrow(/commit all/);
    step(dir, t.target, reference(t));
    await expect(scoreTask(t, dir, base, dataRoot, true)).rejects.toThrow(/lacks recorded/);
    step(dir, 'src/users.ts', readFileSync(path.join(dir, 'src/users.ts'), 'utf8') + '\n');
    await expect(scoreTask(t, dir, base)).rejects.toThrow(/protected fixture/);
    const out = temp();
    writeFileSync(path.join(out, 'run.json'), JSON.stringify({ version: 3, arm: 'baseline', taskSetHash: taskSetHash(), workspaces: [] }));
    await expect(score(out, 'baseline', 'synthetic', temp())).rejects.toThrow(/all 15/);
  });
  it('does not treat a line move as a repair', () => {
    const e = { file: 'a.ts', line: 1, kind: 'arity', name: 'f', message: '', evidence: ['grounding'] };
    expect(incidentKeys([e])).toEqual(incidentKeys([{ ...e, line: 40 }]));
    expect(new Set(incidentKeys([e, e])).size).toBe(2);
  });
});

function synthetic(arm: Arm, successes: number): ArmResults {
  return { version: 3, arm, taskSetHash: taskSetHash(), agent: 'synthetic test only', proxy: 'synthetic chars/4 proxy', rows: tasks().map((t, i): TaskRow => {
    const success = i < successes;
    return { task: t.id, repo: t.repo, success, wrongCallsFinal: Number(!success), hiddenFailuresCaused: Number(!success), fixTokensProxy: 0,
      finalCommit: 'a'.repeat(40), steps: 1, errors: success ? [] : [{file:t.target,line:1,kind:'unknown-name',name:'invented',message:'synthetic',evidence:['synthetic']}], missingGroundTruth: [], unchecked: [], fixes: [],
      checks: [...(t.repo === 'dispatch-desk' ? [] : ['typescript']), ...[1, 2, 3, 4].map((n) => `scenario-${n}`)].map((id) => ({ id, passed: success, output: '' })) };
  }) };
}
describe('Benchmark v3 reports and phase gate', () => {
  it('uses deterministic paired bootstrap intervals and Wilson success bounds', () => {
    expect(bootstrap([1, 2, 3])).toEqual(bootstrap([1, 2, 3]));
    expect(bootstrap([2, 2, 2]).meanCI95).toEqual([2, 2]);
    expect(() => bootstrap([])).toThrow();
    expect(() => wilson(16, 15)).toThrow();
    expect(wilson(0, 15)[0]).toBeCloseTo(0);
    expect(wilson(15, 15)[1]).toBeCloseTo(1);
    const b = synthetic('baseline', 12), g = synthetic('groundwork', 14);
    g.rows.reverse();
    const report = makeReport(b, g);
    expect(report.noSuccessDrop).toBe(true);
    expect(report.pairedDifference.success.total).toBe(2);
    expect(report.pairedDifference.wrongCallsFinal.total).toBe(-2);
    expect(report.pairedDifference.hiddenFailuresCaused.total).toBe(-2);
    expect(report.pairedDifference.success.meanCI95[0]).toBeGreaterThanOrEqual(0);
    expect(report.arms.groundwork.success.count).toBe(14);
  });
  it('fails on missing/stale/duplicate/inconsistent evidence and absent or tampered intervals', () => {
    const dir = temp(), b = synthetic('baseline', 12), g = synthetic('groundwork', 14);
    expect(validateStoredResults(dir).ok).toBe(false);
    expect(() => validateArm({ ...b, rows: b.rows.slice(1) }, 'baseline')).toThrow();
    expect(() => validateArm({ ...b, taskSetHash: 'stale' }, 'baseline')).toThrow(/stale/);
    expect(() => validateArm({ ...b, rows: b.rows.map(() => b.rows[0]) }, 'baseline')).toThrow(/15 tasks/);
    const inconsistent = structuredClone(b); inconsistent.rows[0]!.wrongCallsFinal = 1;
    expect(() => validateArm(inconsistent, 'baseline')).toThrow(/inconsistent/);
    writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(b));
    writeFileSync(path.join(dir, 'groundwork.json'), JSON.stringify(g));
    const report = writeReport(dir);
    expect(validateStoredResults(dir).ok).toBe(true);
    const malformed = structuredClone(report) as Partial<typeof report>; delete malformed.pairedDifference;
    writeFileSync(path.join(dir, 'report.json'), JSON.stringify(malformed));
    expect(validateStoredResults(dir).ok).toBe(false);
    writeFileSync(path.join(dir, 'groundwork.json'), JSON.stringify(synthetic('groundwork', 11)));
    writeReport(dir);
    expect(validateStoredResults(dir)).toMatchObject({ ok: false, detail: expect.stringContaining('success dropped') });
  });
  it('explicitly skips Benchmark v3 under --quick', async () => {
    const check = PHASE4_CHECKS.find((c) => c.name.startsWith('Benchmark v3'))!;
    expect(await check.run({ quick: true, sequences: 1 })).toMatchObject({ ok: true, skipped: true, detail: expect.stringContaining('--quick') });
  });
});

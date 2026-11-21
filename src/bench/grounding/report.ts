import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import { prng } from '../../selftest/synth.js';
import { armSchema, dataRoot, tasks, taskSetHash, type Arm } from './tasks.js';
import type { ArmResults } from './score.js';

export const metrics = ['wrongCallsFinal', 'hiddenFailuresCaused', 'fixTokensProxy'] as const;
export type Metric = typeof metrics[number];
export interface Estimate { total: number; mean: number; meanCI95: [number, number]; totalCI95: [number, number] }
export interface SuccessEstimate { count: number; total: number; rate: number; wilson95: [number, number] }
export interface BenchmarkReport {
  version: 3; taskSetHash: string; seed: number; bootstrapSamples: number; tasks: string[]; agents: Record<Arm, string>;
  arms: Record<Arm, { success: SuccessEstimate; metrics: Record<Metric, Estimate> }>;
  pairedDifference: Record<Metric | 'success', Estimate>;
  noSuccessDrop: boolean;
}
const finite = z.number().finite().nonnegative();
const rowSchema = z.object({
  task: z.string(), repo: z.string(), success: z.boolean(), wrongCallsFinal: finite.int(), hiddenFailuresCaused: finite.int(), fixTokensProxy: finite,
  finalCommit: z.string().regex(/^[a-f0-9]{40}$/), steps: finite.int(),
  errors: z.array(z.object({ file: z.string(), line: z.number().int().positive(), column: finite.int().optional(), kind: z.string(), name: z.string(), message: z.string(), evidence: z.array(z.string()).min(1) })),
  checks: z.array(z.object({ id: z.string(), passed: z.boolean(), output: z.string() })),
  missingGroundTruth: z.array(z.string()), unchecked: z.array(z.string()),
  fixes: z.array(z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/), errors: z.array(z.string()).min(1), diffChars: finite.int(), feedbackChars: finite.int() })),
});
const resultSchema = z.object({ version: z.literal(3), arm: armSchema, taskSetHash: z.string(), agent: z.string().trim().min(1), proxy: z.string().min(1), rows: z.array(rowSchema).length(15) });

export function validateArm(value: unknown, arm: Arm, root = dataRoot): ArmResults {
  const parsed = resultSchema.parse(value);
  const ids = tasks(root).map((t) => t.id);
  if (parsed.arm !== arm || parsed.taskSetHash !== taskSetHash(root)) throw new Error(`${arm}: wrong arm or stale task-set hash`);
  if (new Set(parsed.rows.map((r) => r.task)).size !== 15 || ids.some((id) => !parsed.rows.some((r) => r.task === id))) throw new Error(`${arm}: expected exactly the current 15 tasks`);
  for (const task of tasks(root)) if (parsed.rows.find((r) => r.task === task.id)!.repo !== task.repo) throw new Error(`${arm}: wrong repository for ${task.id}`);
  for (const row of parsed.rows) {
    const expected = [...(row.repo === 'dispatch-desk' ? [] : ['typescript']), ...[1, 2, 3, 4].map((n) => `scenario-${n}`)];
    if (row.checks.length !== expected.length || expected.some((id) => row.checks.filter((c) => c.id === id).length !== 1)) throw new Error(`${row.task}: incomplete acceptance checks`);
    if (row.success !== row.checks.every((c) => c.passed) || row.wrongCallsFinal !== row.errors.length || row.hiddenFailuresCaused > row.checks.filter((c) => !c.passed).length
      || row.fixTokensProxy !== row.fixes.reduce((sum, f) => sum + (f.diffChars + f.feedbackChars) / 4, 0)) throw new Error(`${row.task}: inconsistent metrics/evidence`);
  }
  return value as ArmResults;
}

export function wilson(count: number, total: number): [number, number] {
  if (!Number.isInteger(count) || !Number.isInteger(total) || total <= 0 || count < 0 || count > total) throw new Error('Invalid success count');
  const z = 1.959963984540054, p = count / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function bootstrap(values: number[], seed = 3107, draws = 10_000): Estimate {
  if (!values.length || values.some((v) => !Number.isFinite(v)) || !Number.isInteger(draws) || draws < 100) throw new Error('Bootstrap needs finite observations and >=100 draws');
  const random = prng(seed), means: number[] = [];
  for (let i = 0; i < draws; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) sum += values[Math.floor(random() * values.length)]!;
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const low = means[Math.max(0, Math.ceil(draws * 0.025) - 1)]!, high = means[Math.ceil(draws * 0.975) - 1]!;
  const total = values.reduce((a, b) => a + b, 0);
  return { total, mean: total / values.length, meanCI95: [low, high], totalCI95: [low * values.length, high * values.length] };
}

export function makeReport(baseline: ArmResults, groundwork: ArmResults, root = dataRoot): BenchmarkReport {
  validateArm(baseline, 'baseline', root); validateArm(groundwork, 'groundwork', root);
  const ids = tasks(root).map((t) => t.id);
  const ordered = (results: ArmResults) => ids.map((id) => results.rows.find((r) => r.task === id)!);
  const b = ordered(baseline), g = ordered(groundwork);
  const summarize = (rows: ArmResults['rows']) => {
    const count = rows.filter((r) => r.success).length;
    return { success: { count, total: 15, rate: count / 15, wilson95: wilson(count, 15) },
      metrics: Object.fromEntries(metrics.map((m) => [m, bootstrap(rows.map((r) => r[m]))])) as Record<Metric, Estimate> };
  };
  return { version: 3, taskSetHash: taskSetHash(root), seed: 3107, bootstrapSamples: 10_000, tasks: ids,
    agents: { baseline: baseline.agent, groundwork: groundwork.agent },
    arms: { baseline: summarize(b), groundwork: summarize(g) },
    pairedDifference: Object.fromEntries([...metrics, 'success' as const].map((m) => [m, bootstrap(g.map((row, i) => Number(row[m]) - Number(b[i]![m])))])) as BenchmarkReport['pairedDifference'],
    noSuccessDrop: g.filter((r) => r.success).length >= b.filter((r) => r.success).length };
}

export function markdown(report: BenchmarkReport): string {
  const ci = (a: number[]) => `[${a.map((v) => v.toFixed(3)).join(', ')}]`;
  const lines = ['# Benchmark v3 — grounding', '', `Task-set SHA256: \`${report.taskSetHash}\``, '',
    `Agents: baseline **${report.agents.baseline}**; Groundwork **${report.agents.groundwork}**.`, '',
    '95% percentile bootstrap intervals: 10,000 seeded resamples (seed 3107), sampling the 15 tasks with replacement. Differences pair the same tasks (Groundwork minus baseline). These intervals cover task variation, not independent agent/model reruns. Success uses Wilson intervals; the no-drop gate compares observed counts, not a statistical noninferiority claim.', '',
    '| Arm | Success | Rate | Wilson 95% |', '|---|---:|---:|---|'];
  for (const arm of ['baseline', 'groundwork'] as const) {
    const s = report.arms[arm].success;
    lines.push(`| ${arm} | ${s.count}/${s.total} | ${s.rate.toFixed(3)} | ${ci(s.wilson95)} |`);
  }
  lines.push('', '| Metric | Arm/difference | Total (95% CI) | Mean (95% CI) |', '|---|---|---|---|');
  for (const m of [...metrics, 'success' as const]) {
    for (const arm of ['baseline', 'groundwork', 'pairedDifference'] as const) {
      if (m === 'success' && arm !== 'pairedDifference') continue;
      const e = arm === 'pairedDifference' ? report.pairedDifference[m] : report.arms[arm].metrics[m as Metric];
      lines.push(`| ${m} | ${arm} | ${e.total.toFixed(3)} ${ci(e.totalCI95)} | ${e.mean.toFixed(3)} ${ci(e.meanCI95)} |`);
    }
  }
  lines.push('', `Observed no success drop: **${report.noSuccessDrop ? 'PASS' : 'FAIL'}**.`, '',
    'Fix tokens are a chars/4 proxy: source fix-commit diffs plus matching recorded grounding feedback, not billed/model tokens. Missing intermediate commits/feedback and conservative static/dynamic attribution cause undercounting. See README.md and per-task evidence before interpreting differences.', '');
  return lines.join('\n');
}

export function writeReport(resultsDir = path.join(dataRoot, 'results'), root = dataRoot): BenchmarkReport {
  const b = validateArm(JSON.parse(readFileSync(path.join(resultsDir, 'baseline.json'), 'utf8')), 'baseline', root);
  const g = validateArm(JSON.parse(readFileSync(path.join(resultsDir, 'groundwork.json'), 'utf8')), 'groundwork', root);
  const report = makeReport(b, g, root);
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(path.join(resultsDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(path.join(resultsDir, 'report.md'), markdown(report));
  return report;
}

export function validateStoredResults(resultsDir = path.join(dataRoot, 'results'), root = dataRoot): { ok: boolean; detail: string } {
  const missing = ['baseline.json', 'groundwork.json', 'report.json', 'report.md'].filter((f) => !existsSync(path.join(resultsDir, f)));
  if (missing.length) return { ok: false, detail: `Benchmark v3 missing evidence: ${missing.join(', ')}. Run both agent arms, then score and report; reference validation is not agent evidence.` };
  try {
    const baseline = validateArm(JSON.parse(readFileSync(path.join(resultsDir, 'baseline.json'), 'utf8')), 'baseline', root);
    const groundwork = validateArm(JSON.parse(readFileSync(path.join(resultsDir, 'groundwork.json'), 'utf8')), 'groundwork', root);
    const expected = makeReport(baseline, groundwork, root);
    if (JSON.stringify(JSON.parse(readFileSync(path.join(resultsDir, 'report.json'), 'utf8'))) !== JSON.stringify(expected)) throw new Error('Stored intervals/report do not match deterministic recomputation; run report');
    if (readFileSync(path.join(resultsDir, 'report.md'), 'utf8') !== markdown(expected)) throw new Error('Markdown report is stale');
    return { ok: expected.noSuccessDrop, detail: `Benchmark v3: 15 paired tasks; 95% bootstrap and Wilson intervals validated; success ${expected.arms.baseline.success.count}/15 baseline, ${expected.arms.groundwork.success.count}/15 Groundwork${expected.noSuccessDrop ? '' : ' (success dropped)'}` };
  } catch (e) { return { ok: false, detail: `Benchmark v3 invalid evidence: ${(e as Error).message}` }; }
}

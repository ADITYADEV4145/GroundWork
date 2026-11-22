import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CheckResult } from './registry.js';

export const BLOCK_REVIEW_POLICY = "Agent review is accepted for this gate per Aditya's decision. Reviewer names are recorded on each row, not independently authenticated.";

const location = z.object({ file: z.string(), symbol: z.string(), line: z.number().int().positive() });
const rowSchema = z.object({
  suite: z.enum(['reuse-v2', 'block-v2']).optional(),
  kind: z.enum(['duplicate', 'dead-after-change', 'duplicate-constant', 'duplicate-file', 'invalid-allow', 'grounding']).optional(),
  task_id: z.string(), arm: z.enum(['baseline', 'groundwork']), added: location, existing: location.nullable(),
  probability: z.number().finite().min(0).max(1).optional(), signals: z.array(z.object({ name: z.string(), value: z.number().finite() })),
  verdict: z.enum(['agree', 'disagree']).nullable(), reviewer: z.string().nullable(), reasoning: z.string().nullable(),
  resolved_by: z.object({ commit: z.string().regex(/^[a-f0-9]{40}$/), note: z.string().trim().min(1) }).optional(),
});

const scoringSchema = z.object({
  suite: rowSchema.shape.suite, task_id: z.string(), arm: rowSchema.shape.arm, status: z.string(),
  check: z.object({ status: z.string(), findings: z.array(rowSchema.pick({ kind: true, added: true, existing: true }).extend({ severity: z.string() })) }),
});
export type ReviewScoring = z.infer<typeof scoringSchema>;
type ReviewRow = z.infer<typeof rowSchema>;

export function readReviewScoring(directory: string, rows: ReviewRow[]): ReviewScoring[] {
  const results: ReviewScoring[] = [];
  for (const row of rows.filter(row => row.resolved_by)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(row.task_id)) continue;
    const file = path.join(directory, (row.suite ?? 'reuse-v2') === 'block-v2' ? 'block-results' : 'results', row.task_id, `${row.arm}.json`);
    try {
      const parsed = scoringSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (parsed.success) results.push({ ...parsed.data, suite: parsed.data.suite ?? row.suite ?? 'reuse-v2' });
    } catch { /* Missing or invalid scoring cannot resolve a historical BLOCK. */ }
  }
  return results;
}

export function resolvedReviewRows(rows: ReviewRow[], scoring: ReviewScoring[]): ReviewRow[] {
  const sameLocation = (a: z.infer<typeof location> | null, b: z.infer<typeof location> | null) =>
    a === null || b === null ? a === b : a.file === b.file && a.symbol === b.symbol;
  return rows.filter(row => {
    if (!row.resolved_by || row.verdict !== 'disagree' || !row.reviewer?.trim() || !row.reasoning?.trim()) return false;
    const current = scoring.filter(result => (result.suite ?? 'reuse-v2') === (row.suite ?? 'reuse-v2') && result.task_id === row.task_id && result.arm === row.arm);
    return current.length > 0 && current.every(result =>
      result.status === 'scored' && ['PASS', 'WARN', 'BLOCK'].includes(result.check.status) &&
      !result.check.findings.some(f => f.severity === 'BLOCK' && (f.kind ?? 'duplicate') === (row.kind ?? 'duplicate') &&
        sameLocation(f.added, row.added) && sameLocation(f.existing, row.existing)));
  });
}

export function resolutionDetail(rows: ReviewRow[], scoring: ReviewScoring[]): string {
  const resolved = resolvedReviewRows(rows, scoring);
  const fixes = [...new Set(resolved.map(row => row.resolved_by!.commit))].sort().join(', ') || 'none';
  return `${resolved.length} false-positive rows excluded after detector fix ${fixes}. Resolution requires successful current scoring that no longer produces that BLOCK; historical rows and verdicts are retained.`;
}

export function summarizeBlockReview(allRows: ReviewRow[], scoring: ReviewScoring[] = []) {
  const resolved = new Set(resolvedReviewRows(allRows, scoring));
  const rows = allRows.filter(row => !resolved.has(row));
  const attributed = (row: z.infer<typeof rowSchema>) => row.verdict !== null && Boolean(row.reviewer?.trim() && row.reasoning?.trim());
  const fileLevel = (row: z.infer<typeof rowSchema>) => row.kind === 'duplicate-file' || (!row.kind && row.added.symbol === row.added.file && Boolean(row.existing && row.existing.symbol === row.existing.file));
  const filePair = (row: z.infer<typeof rowSchema>) => JSON.stringify([row.added.file, row.existing?.file]);
  const covered = new Set(rows.filter(row => attributed(row) && !fileLevel(row) && (!row.kind || ['duplicate', 'duplicate-constant'].includes(row.kind))).map(filePair));
  const pairs = new Map<string, typeof rows>();
  const symbolPairs = new Map<string, typeof rows>();
  let coveredFileRows = 0;
  let coveredNestedRows = 0;
  const symbolRows = rows.filter(row => !fileLevel(row) && (!row.kind || ['duplicate', 'duplicate-constant'].includes(row.kind)));
  const summarize = (groups: Map<string, typeof rows>) => {
    const reviewedPairs = [...groups.values()].map(group => group.filter(attributed)).filter(group => group.length);
    const reviewed = reviewedPairs.length;
    const agree = reviewedPairs.filter(group => group.every(row => row.verdict === 'agree')).length;
    return { reviewed, agree, agreement: reviewed ? agree / reviewed : 0, pending: groups.size - reviewed };
  };
  for (const row of rows) {
    if (fileLevel(row) && covered.has(filePair(row))) { coveredFileRows++; continue; }
    const key = JSON.stringify([row.added.file, row.added.symbol, row.existing?.file, row.existing?.symbol]);
    if (!fileLevel(row)) symbolPairs.set(key, [...(symbolPairs.get(key) ?? []), row]);
    if (symbolRows.includes(row) && symbolRows.some(parent => attributed(parent) && filePair(parent) === filePair(row) &&
      row.added.symbol.startsWith(`${parent.added.symbol}.`) && parent.existing && row.existing?.symbol.startsWith(`${parent.existing.symbol}.`))) {
      coveredNestedRows++;
      continue;
    }
    const group = pairs.get(key) ?? [];
    group.push(row);
    pairs.set(key, group);
  }
  const symbols = summarize(symbolPairs);
  return { ...summarize(pairs), symbolReviewed: symbols.reviewed, symbolAgree: symbols.agree, symbolAgreement: symbols.agreement, symbolPending: symbols.pending,
    rawRows: allRows.length, rawReviewed: allRows.filter(attributed).length, coveredFileRows, coveredNestedRows, resolvedRows: resolved.size };
}

export function evaluateRealRepoReview(directory: string): CheckResult {
  const file = path.join(directory, 'block-review.json');
  if (!existsSync(file)) return { ok: true, skipped: true, detail: 'skipped: Benchmark v2 block-review.json absent; no BLOCK agreement evidence' };
  try {
    const rows = z.array(rowSchema).parse(JSON.parse(readFileSync(file, 'utf8')));
    const identities = rows.map(r => JSON.stringify([r.suite ?? 'reuse-v2', r.kind ?? 'duplicate', r.task_id, r.arm, r.added, r.existing]));
    if (new Set(identities).size !== rows.length) throw new Error('duplicate review rows');
    const scoring = readReviewScoring(directory, rows);
    const metrics = summarizeBlockReview(rows, scoring);
    return { ok: metrics.reviewed >= 10 && metrics.agreement >= 0.9,
      detail: `${metrics.agree}/${metrics.reviewed} independent reviewed BLOCK pairs agree (${(100 * metrics.agreement).toFixed(1)}%); ${metrics.pending} independent pairs pending; ${metrics.rawReviewed}/${metrics.rawRows} raw rows reviewed, ${metrics.coveredFileRows} covered duplicate-file rows and ${metrics.coveredNestedRows} covered nested-function rows excluded; requires >=10 independent reviewed pairs and >=90% agreement. ${resolutionDetail(rows, scoring)} ${BLOCK_REVIEW_POLICY} Recorded reviewers: ${[...new Set(rows.map(row => row.reviewer?.trim()).filter(Boolean))].sort().join('; ') || 'none'}.`,
      metrics };
  } catch (error) { return { ok: false, detail: `Invalid BLOCK review evidence: ${error}` }; }
}

const proportion = z.object({ count: z.number().int().nonnegative(), n: z.number().int().nonnegative(), rate: z.number().min(0).max(1).nullable() });
const armSchema = z.object({ n: z.number().int().nonnegative(), unknownLabels: z.number().int().nonnegative(), duplicates: proportion, success: proportion });
export function evaluateBenchmarkV2(directory: string): CheckResult {
  const file = path.join(directory, 'report.json');
  if (!existsSync(file)) return { ok: true, skipped: true, detail: 'skipped: Benchmark v2 report.json absent; agent experiment not run' };
  try {
    const report = z.object({ schemaVersion: z.literal(1), arms: z.object({ baseline: armSchema, groundwork: armSchema }) }).parse(JSON.parse(readFileSync(file, 'utf8')));
    const { baseline: a, groundwork: b } = report.arms;
    for (const arm of [a, b]) {
      if (arm.duplicates.n + arm.unknownLabels !== arm.n || arm.success.n !== arm.n) throw new Error('inconsistent denominators');
      for (const metric of [arm.duplicates, arm.success]) {
        if (metric.count > metric.n || (metric.n ? metric.rate === null || Math.abs(metric.rate - metric.count / metric.n) > 1e-10 : metric.rate !== null)) throw new Error('inconsistent rates');
      }
    }
    if (!a.n || !b.n || a.unknownLabels || b.unknownLabels) return { ok: false, detail: 'Benchmark v2 requires both arms with nonempty, fully labeled results' };
    const drop = b.duplicates.rate! < a.duplicates.rate!, holds = b.success.rate! >= a.success.rate!;
    return { ok: drop && holds,
      detail: `Duplicate rate baseline ${(100 * a.duplicates.rate!).toFixed(1)}%, groundwork ${(100 * b.duplicates.rate!).toFixed(1)}%; success baseline ${(100 * a.success.rate!).toFixed(1)}%, groundwork ${(100 * b.success.rate!).toFixed(1)}%. Gate uses strict duplicate reduction and no success drop in point estimates; intervals are reported, not a noninferiority claim.` };
  } catch (error) { return { ok: false, detail: `Invalid Benchmark v2 report: ${error}` }; }
}

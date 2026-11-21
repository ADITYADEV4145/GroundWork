import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CheckResult } from './registry.js';

const location = z.object({ file: z.string(), symbol: z.string(), line: z.number().int().positive() });
const rowSchema = z.object({
  suite: z.enum(['reuse-v2', 'block-v2']).optional(),
  kind: z.enum(['duplicate', 'dead-after-change', 'duplicate-constant', 'duplicate-file', 'invalid-allow', 'grounding']).optional(),
  task_id: z.string(), arm: z.enum(['baseline', 'groundwork']), added: location, existing: location.nullable(),
  probability: z.number().finite().min(0).max(1).optional(), signals: z.array(z.object({ name: z.string(), value: z.number().finite() })),
  verdict: z.enum(['agree', 'disagree']).nullable(), reviewer: z.string().nullable(), reasoning: z.string().nullable(),
});

export function summarizeBlockReview(rows: z.infer<typeof rowSchema>[]) {
  const attributed = (row: z.infer<typeof rowSchema>) => row.verdict !== null && Boolean(row.reviewer?.trim() && row.reasoning?.trim());
  const fileLevel = (row: z.infer<typeof rowSchema>) => row.kind === 'duplicate-file' || (!row.kind && row.added.symbol === row.added.file && Boolean(row.existing && row.existing.symbol === row.existing.file));
  const filePair = (row: z.infer<typeof rowSchema>) => JSON.stringify([row.added.file, row.existing?.file]);
  const covered = new Set(rows.filter(row => attributed(row) && !fileLevel(row) && (!row.kind || ['duplicate', 'duplicate-constant'].includes(row.kind))).map(filePair));
  const pairs = new Map<string, typeof rows>();
  let coveredFileRows = 0;
  for (const row of rows) {
    if (fileLevel(row) && covered.has(filePair(row))) { coveredFileRows++; continue; }
    const key = JSON.stringify([row.added.file, row.added.symbol, row.existing?.file, row.existing?.symbol]);
    const group = pairs.get(key) ?? [];
    group.push(row);
    pairs.set(key, group);
  }
  const reviewedPairs = [...pairs.values()].map(group => group.filter(attributed)).filter(group => group.length);
  const reviewed = reviewedPairs.length;
  const agree = reviewedPairs.filter(group => group.every(row => row.verdict === 'agree')).length;
  return { reviewed, agree, agreement: reviewed ? agree / reviewed : 0, pending: pairs.size - reviewed,
    rawRows: rows.length, rawReviewed: rows.filter(attributed).length, coveredFileRows };
}

export function evaluateRealRepoReview(directory: string): CheckResult {
  const file = path.join(directory, 'block-review.json');
  if (!existsSync(file)) return { ok: true, skipped: true, detail: 'skipped: Benchmark v2 block-review.json absent; no BLOCK agreement evidence' };
  try {
    const rows = z.array(rowSchema).parse(JSON.parse(readFileSync(file, 'utf8')));
    const identities = rows.map(r => JSON.stringify([r.suite ?? 'reuse-v2', r.kind ?? 'duplicate', r.task_id, r.arm, r.added, r.existing]));
    if (new Set(identities).size !== rows.length) throw new Error('duplicate review rows');
    const metrics = summarizeBlockReview(rows);
    return { ok: metrics.reviewed >= 10 && metrics.agreement >= 0.9,
      detail: `${metrics.agree}/${metrics.reviewed} distinct reviewed BLOCK pairs agree (${(100 * metrics.agreement).toFixed(1)}%); ${metrics.pending} distinct pairs pending; ${metrics.rawReviewed}/${metrics.rawRows} raw rows reviewed, ${metrics.coveredFileRows} covered duplicate-file rows excluded; requires >=10 distinct reviewed pairs and >=90% agreement. Reviewer identity is recorded, not independently authenticated.`,
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

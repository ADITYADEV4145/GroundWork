import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { CheckResult } from './registry.js';

const location = z.object({ file: z.string(), symbol: z.string(), line: z.number().int().positive() });
const rowSchema = z.object({
  task_id: z.string(), arm: z.enum(['baseline', 'groundwork']), added: location, existing: location.nullable(),
  probability: z.number().finite().min(0).max(1).optional(), signals: z.array(z.object({ name: z.string(), value: z.number().finite() })),
  verdict: z.enum(['agree', 'disagree']).nullable(), reviewer: z.string().nullable(), reasoning: z.string().nullable(),
});

export function evaluateRealRepoReview(directory: string): CheckResult {
  const file = path.join(directory, 'block-review.json');
  if (!existsSync(file)) return { ok: true, skipped: true, detail: 'skipped: Benchmark v2 block-review.json absent; no BLOCK agreement evidence' };
  try {
    const rows = z.array(rowSchema).parse(JSON.parse(readFileSync(file, 'utf8')));
    const identities = rows.map(r => JSON.stringify([r.task_id, r.arm, r.added, r.existing]));
    if (new Set(identities).size !== rows.length) throw new Error('duplicate review rows');
    const reviewed = rows.filter(r => r.verdict !== null && r.reviewer?.trim() && r.reasoning?.trim());
    const agree = reviewed.filter(r => r.verdict === 'agree').length;
    const agreement = reviewed.length ? agree / reviewed.length : 0;
    return { ok: reviewed.length >= 10 && agreement >= 0.9,
      detail: `${agree}/${reviewed.length} reviewed BLOCKs agree (${(100 * agreement).toFixed(1)}%); ${rows.length - reviewed.length} pending; requires >=10 reviewed and >=90% agreement. Reviewer identity is recorded, not independently authenticated.`,
      metrics: { reviewed: reviewed.length, agree, agreement } };
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

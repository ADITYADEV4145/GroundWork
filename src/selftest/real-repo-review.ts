import type { CheckResult } from './registry.js';

export function evaluateRealRepoReview(_directory: string): CheckResult {
  return { ok: true, skipped: true, detail: 'skipped: evidence not stored; gate deferred to Benchmark v2' };
}

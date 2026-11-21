import { CHECKS } from './checks/index.js';
import type { CheckOptions, CheckResult } from './registry.js';

export interface SelftestReport {
  through: number;
  ok: boolean;
  results: (CheckResult & { phase: number; name: string; ms: number })[];
}

export async function runSelftest(through: number, opts: CheckOptions, onResult?: (r: SelftestReport['results'][number]) => void): Promise<SelftestReport> {
  const results: SelftestReport['results'] = [];
  for (const c of CHECKS.filter((c) => c.phase <= through)) {
    const t0 = performance.now();
    let r: CheckResult;
    if (c.slow && opts.quick) r = { ok: true, skipped: true, detail: 'skipped (--quick)' };
    else
      try {
        r = await c.run(opts);
      } catch (e) {
        r = { ok: false, detail: `threw: ${(e as Error).stack ?? String(e)}` };
      }
    const res = { ...r, phase: c.phase, name: c.name, ms: Math.round(performance.now() - t0) };
    results.push(res);
    onResult?.(res);
  }
  return { through, ok: results.every((r) => r.ok), results };
}

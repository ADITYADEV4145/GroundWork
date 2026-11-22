import type { Evidence } from './schema.js';

export function sessionInterval(baseline: number[], groundwork: number[]) {
  if (!baseline.length || !groundwork.length) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if ([...baseline, ...groundwork].some((x) => !Number.isFinite(x) || x < 0)) throw new Error('Invalid session metric');
  if (!mean(baseline)) return null;
  let state = 0x51ab17ed;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
  const draw = (xs: number[]) => mean(xs.map(() => xs[Math.floor(next() * xs.length)]!));
  const values: number[] = [];
  for (let i = 0; i < 10_000; i++) {
    const b = draw(baseline), g = draw(groundwork);
    if (!b) return null;
    values.push(100 * (1 - g / b));
  }
  values.sort((a, b) => a - b);
  return { median: 100 * (1 - mean(groundwork) / mean(baseline)), low: values[249]!, high: values[9749]!, adjustedLow: values[124]! };
}

export function sessionSummary(evidence: Evidence, tasks: number, runs: number) {
  const stable = evidence.captures.some((c) => c.protocol === 'stable-v1');
  if (stable && (runs !== 16 || evidence.captures.some((c) => c.protocol !== 'stable-v1'))) throw new Error('Stable protocol requires 16 sessions per arm');
  if (stable && (evidence.captures.length !== 32 || ['baseline', 'groundwork'].some((arm) => {
    const captures = evidence.captures.filter((c) => c.condition === arm);
    return captures.length !== 16 || new Set(captures.map((c) => c.run)).size !== 16 || captures.some((c) => c.run < 1 || c.run > 16);
  }))) throw new Error('Incomplete stable session set');
  const rows = evidence.captures.map((c) => {
    const starts = c.samples.map((s) => s.startedAt);
    const ends = c.samples.map((s) => s.endedAt);
    const start = c.sessionStartedAt ?? (starts.every((x) => x !== undefined) ? Math.min(...starts as number[]) : undefined);
    const end = c.sessionEndedAt ?? (ends.every((x) => x !== undefined) ? Math.max(...ends as number[]) : undefined);
    const tool = c.samples.every((s) => s.toolSideMs !== undefined) ? c.samples.reduce((n, s) => n + s.toolSideMs!, 0) : undefined;
    if (stable && (c.sessionStartedAt === undefined || c.sessionEndedAt === undefined || c.sessionStartBasis === undefined || tool === undefined || end! < start! || starts.some((x) => x === undefined || x < start!) || ends.some((x) => x === undefined || x > end!))) throw new Error('Incomplete stable session timing');
    return { condition: c.condition, elapsed: start === undefined || end === undefined ? undefined : (end - start) / tasks, bytes: c.samples.reduce((n, s) => n + s.toolOutputBytes, 0), tool };
  });
  const metric = (key: 'elapsed' | 'bytes' | 'tool') => {
    if (rows.some((r) => r[key] === undefined)) return null;
    const b = rows.filter((r) => r.condition === 'baseline').map((r) => r[key]!);
    const g = rows.filter((r) => r.condition === 'groundwork').map((r) => r[key]!);
    return { baselineMean: b.reduce((a, v) => a + v, 0) / b.length, groundworkMean: g.reduce((a, v) => a + v, 0) / g.length, reductionPct: sessionInterval(b, g) };
  };
  return { basis: stable ? 'recorded-session' : evidence.captures.every((c) => c.sessionStartedAt !== undefined && c.sessionEndedAt !== undefined) ? 'first-captured-action' : 'historical-envelope-proxy', elapsedMsPerTask: metric('elapsed'), emittedBytesPerSession: metric('bytes'), toolSideMsPerSession: metric('tool') };
}

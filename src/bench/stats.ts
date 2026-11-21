import type { Evidence, Sample, Suite } from './schema.js';

const add = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
}

export function interval(values: number[]) {
  if (!values.length) return null;
  // Resample tasks, not individual trials: repeats of the same task share an answer and difficulty.
  let state = 0x963b41d7;
  function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  }
  const samples = Array.from({ length: 2_000 }, () =>
    median(Array.from({ length: values.length }, () => values[Math.floor(next() * values.length)]!))).sort((a, b) => a - b);
  return { median: median(values), low: samples[49]!, high: samples[1949]! };
}

type Interval = ReturnType<typeof interval>;
const reduction = (base: number, treatment: number): number | null => base ? 100 * (base - treatment) / base : null;
const valid = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x !== null);

function totals(samples: Sample[]) {
  const sum = (key: 'toolCalls' | 'toolOutputBytes' | 'filesRead' | 'readBytes' | 'readBlocks' | 'wallMs') =>
    add(samples.map((sample) => sample[key]));
  const totalUsage = samples.every((sample) => sample.usage !== undefined) ? {
    inputTokens: add(samples.map((sample) => sample.usage!.inputTokens)),
    outputTokens: add(samples.map((sample) => sample.usage!.outputTokens)),
  } : null;
  return {
    success: samples.filter((sample) => sample.success).length, attempts: samples.length,
    toolCalls: sum('toolCalls'), estimatedToolOutputTokens: sum('toolOutputBytes') / 4,
    filesRead: sum('filesRead'), readBytes: sum('readBytes'), readBlocks: sum('readBlocks'),
    wallMs: sum('wallMs'), providerUsage: totalUsage,
  };
}

export function summarize(suite: Suite, suiteName: string, evidence: Evidence, runs: number) {
  const pairs = new Map<string, Sample[]>();
  const expected = new Set(suite.tasks.map((task) => task.id));
  const first = evidence.captures[0]!;
  const overrides = new Set<string>();
  for (const capture of evidence.captures) {
    if (capture.suite !== suiteName || capture.revision !== suite.revision || evidence.suite !== suiteName) {
      throw new Error('Observations do not match the selected suite and pinned revision');
    }
    if (capture.agent !== first.agent || capture.model !== first.model || capture.captureRevision !== first.captureRevision ||
        capture.node !== first.node) throw new Error('Paired observations must use the same agent, model, Node and capture revision');
    const key = `${capture.condition}:${capture.run}`;
    if (capture.run > runs || pairs.has(key)) throw new Error(`Unexpected or duplicate replicate ${key}`);
    const ids = new Set(capture.samples.map((sample) => sample.task));
    if (ids.size !== expected.size || ids.size !== capture.samples.length || [...ids].some((id) => !expected.has(id))) {
      const missing = [...expected].filter((id) => !ids.has(id));
      throw new Error(`Incomplete or duplicate observations in ${key}${missing.length ? ': missing ' + missing.join(', ') : ''}`);
    }
    for (const sample of capture.samples) for (const metric of Object.keys(sample.metrics ?? {})) overrides.add(metric);
    pairs.set(key, capture.samples);
  }
  for (let run = 1; run <= runs; run++) {
    if (!pairs.has(`baseline:${run}`) || !pairs.has(`groundwork:${run}`)) throw new Error(`Missing baseline or GroundWork replicate ${run}`);
  }
  const baseline = [...pairs.entries()].filter(([key]) => key.startsWith('baseline:')).flatMap(([, values]) => values);
  const treatment = [...pairs.entries()].filter(([key]) => key.startsWith('groundwork:')).flatMap(([, values]) => values);
  const rows = suite.tasks.map((task) => {
    const bases = baseline.filter((sample) => sample.task === task.id);
    const gws = treatment.filter((sample) => sample.task === task.id);
    const b = totals(bases);
    const g = totals(gws);
    const metrics = Object.fromEntries([...overrides].flatMap((name) => {
      const bValues = bases.map((sample) => sample.metrics?.[name]);
      const gValues = gws.map((sample) => sample.metrics?.[name]);
      if (bValues.some((n) => n === undefined) || gValues.some((n) => n === undefined)) return [];
      return [[name, { baseline: add(bValues as number[]), groundwork: add(gValues as number[]) }]];
    }));
    return {
      task: task.id, category: task.category, repo: task.repo, sequence: task.sequence, step: task.step,
      baseline: b, groundwork: g, estimatedReductionPct: reduction(b.estimatedToolOutputTokens, g.estimatedToolOutputTokens),
      modelInputReductionPct: b.providerUsage && g.providerUsage ? reduction(b.providerUsage.inputTokens, g.providerUsage.inputTokens) : null,
      metrics,
    };
  });
  const categories = [...new Set(suite.tasks.map((task) => task.category))].map((category) => ({
    category,
    baseline: totals(baseline.filter((sample) => rows.some((row) => row.task === sample.task && row.category === category))),
    groundwork: totals(treatment.filter((sample) => rows.some((row) => row.task === sample.task && row.category === category))),
  }));
  const baselineTotals = totals(baseline);
  const treatmentTotals = totals(treatment);
  const metrics = Object.fromEntries([...overrides].map((name) => {
    const values = rows.flatMap((row) => row.metrics[name] === undefined ? [] : [row.metrics[name]]);
    return [name, {
      coverage: values.length,
      baseline: add(values.map((row) => row.baseline)),
      groundwork: add(values.map((row) => row.groundwork)),
      pairedDeltaPerTask: interval(values.map((row) => (row.groundwork - row.baseline) / runs)),
    }];
  }));
  const estimatedReductions = valid(rows.map((row) => row.estimatedReductionPct));
  const modelReductions = valid(rows.map((row) => row.modelInputReductionPct));
  return {
    suite: suiteName, revision: suite.revision, agent: first.agent, model: first.model, runs,
    baseline: baselineTotals, groundwork: treatmentTotals, categories, tasks: rows, metrics,
    estimatedToolOutputReductionPct: interval(estimatedReductions), toolOutputReductionCoverage: estimatedReductions.length,
    modelInputReductionPct: modelReductions.length === rows.length ? interval(modelReductions) : null,
    wallTimeReductionPct: interval(valid(rows.map((row) => reduction(row.baseline.wallMs, row.groundwork.wallMs)))),
    successDeltaPercentagePoints: interval(rows.map((row) => 100 * (row.groundwork.success - row.baseline.success) / runs)) as NonNullable<Interval>,
    noSuccessDrop: categories.every(({ baseline, groundwork }) => groundwork.success >= baseline.success),
  };
}

export type BenchmarkSummary = ReturnType<typeof summarize>;

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RunRecord } from './harness.js';
import { CATEGORIES, DEFECTS, type Category, type Defect } from './tasks.js';

export interface Interval { estimate: number; low: number; high: number }
export interface ArmSummary {
  arm: string; armVersion: string; expected: number; valid: number; invalid: number;
  successRate: number | null; defectsPerTask: number | null; defects: Record<Defect, number>;
  byCategory: Partial<Record<Category, { valid: number; defectsPerTask: number; successRate: number }>>;
  meanWallMs: number | null; meanTokens: number | null; tokensReported: number;
  /** Against the native arm, over tasks with valid records in both arms. Null when either side has none. */
  versusNative: null | {
    tasks: number; droppedTasks: string[];
    defectReductionPct: Interval | null; successDifferencePts: Interval; timeRatio: Interval; tokenRatio: Interval | null;
  };
}
export interface Verdict { id: string; claim: string; passed: boolean | null; detail: string }
export interface Report {
  format: 1; run: string; taskSetHash: string; agent: string; model: string; replicates: number; tasks: number;
  /** Set only when the run was started against a committed preregistration. Without it no verdict is computed. */
  preregistration: { file: string; commit: string; committedAt: string; sha256: string } | null;
  arms: ArmSummary[]; notRun: { arm: string; reason: string }[];
  invalidRecords: { arm: string; task: string; replicate: number; reasons: string[] }[];
  verdicts: Verdict[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const tokens = (r: RunRecord) => r.usage!.inputTokens + r.usage!.outputTokens + r.usage!.cacheReadTokens + r.usage!.cacheWriteTokens;

/** Deterministic paired bootstrap over tasks: both arms are resampled with the same task indices. */
export function pairedBootstrap(pairs: [number, number][], statistic: (base: number, arm: number) => number | null, draws = 10_000): Interval | null {
  if (!pairs.length) return null;
  const estimate = statistic(mean(pairs.map((p) => p[0])), mean(pairs.map((p) => p[1])));
  if (estimate === null) return null;
  let state = 0x2545f491;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
  const values: number[] = [];
  for (let i = 0; i < draws; i++) {
    let b = 0, a = 0;
    for (let j = 0; j < pairs.length; j++) { const p = pairs[Math.floor(next() * pairs.length)]!; b += p[0]; a += p[1]; }
    const v = statistic(b / pairs.length, a / pairs.length);
    if (v !== null) values.push(v);
  }
  if (values.length < draws * 0.9) return null;
  values.sort((x, y) => x - y);
  return { estimate, low: values[Math.floor(values.length * 0.025)]!, high: values[Math.min(values.length - 1, Math.floor(values.length * 0.975))]! };
}

/** Tasks needed for a paired comparison to detect a mean difference `delta` given the SD of per-task differences (two-sided 5%, 80% power). */
export function tasksNeeded(sdOfDifferences: number, delta: number): number {
  if (!(sdOfDifferences >= 0) || !(delta > 0)) throw new Error('Expected a non-negative SD and a positive difference');
  return Math.max(2, Math.ceil(((1.959964 + 0.841621) * sdOfDifferences / delta) ** 2));
}

export function readRecords(directory: string): RunRecord[] {
  const root = path.join(directory, 'records');
  if (!existsSync(root)) return [];
  return readdirSync(root).sort().flatMap((arm) => readdirSync(path.join(root, arm)).sort()
    .map((f) => JSON.parse(readFileSync(path.join(root, arm, f), 'utf8')) as RunRecord));
}

interface Header { run: string; taskSetHash: string; agent: string; model: string; replicates: number; tasks: string[]; preregistration?: Report['preregistration'] }

export function buildReport(directory: string, notRun: { arm: string; reason: string }[] = []): Report {
  const header = JSON.parse(readFileSync(path.join(directory, 'run.json'), 'utf8')) as Header;
  const records = readRecords(directory);
  const stale = records.find((r) => r.taskSetHash !== header.taskSetHash);
  if (stale) throw new Error(`Record ${stale.arm}/${stale.task}.${stale.replicate} was graded against a different task set`);
  const expected = header.tasks.length * header.replicates;
  const perTask = (arm: string, value: (r: RunRecord) => number | null) => new Map(header.tasks.flatMap((task) => {
    const xs = records.filter((r) => r.arm === arm && r.task === task && !r.invalid.length).map(value).filter((x): x is number => x !== null);
    return xs.length ? [[task, mean(xs)] as [string, number]] : [];
  }));
  const metrics = {
    defects: (r: RunRecord) => r.grade!.totalDefects, success: (r: RunRecord) => r.grade!.success ? 1 : 0,
    wall: (r: RunRecord) => r.wallMs, tokens: (r: RunRecord) => r.usage ? tokens(r) : null,
  };
  const arms = [...new Set(records.map((r) => r.arm))].sort((a, b) => (a === 'native' ? -1 : b === 'native' ? 1 : a.localeCompare(b)));
  const summaries = arms.map((arm): ArmSummary => {
    const mine = records.filter((r) => r.arm === arm), valid = mine.filter((r) => !r.invalid.length), withTokens = valid.filter((r) => r.usage);
    const compare = (metric: keyof typeof metrics, statistic: (b: number, a: number) => number | null) => {
      const base = perTask('native', metrics[metric]), own = perTask(arm, metrics[metric]);
      return pairedBootstrap(header.tasks.filter((t) => base.has(t) && own.has(t)).map((t) => [base.get(t)!, own.get(t)!]), statistic);
    };
    const base = perTask('native', metrics.defects), own = perTask(arm, metrics.defects), shared = header.tasks.filter((t) => base.has(t) && own.has(t));
    const ratio = (b: number, a: number) => b ? a / b : null;
    return {
      arm, armVersion: [...new Set(mine.map((r) => r.armVersion))].join(', '), expected, valid: valid.length, invalid: expected - valid.length,
      successRate: valid.length ? mean(valid.map(metrics.success)) : null,
      defectsPerTask: valid.length ? mean(valid.map(metrics.defects)) : null,
      defects: Object.fromEntries(DEFECTS.map((d) => [d, valid.reduce((n, r) => n + r.grade!.defects[d], 0)])) as Record<Defect, number>,
      byCategory: Object.fromEntries(CATEGORIES.flatMap((c) => {
        const xs = valid.filter((r) => r.category === c);
        return xs.length ? [[c, { valid: xs.length, defectsPerTask: mean(xs.map(metrics.defects)), successRate: mean(xs.map(metrics.success)) }]] : [];
      })),
      meanWallMs: valid.length ? mean(valid.map(metrics.wall)) : null,
      meanTokens: withTokens.length ? mean(withTokens.map(tokens)) : null, tokensReported: withTokens.length,
      versusNative: arm === 'native' || !shared.length ? null : {
        tasks: shared.length, droppedTasks: header.tasks.filter((t) => !shared.includes(t)),
        defectReductionPct: compare('defects', (b, a) => b ? 100 * (1 - a / b) : null),
        successDifferencePts: compare('success', (b, a) => 100 * (a - b))!,
        timeRatio: compare('wall', ratio)!, tokenRatio: compare('tokens', ratio),
      },
    };
  });
  const report: Report = {
    format: 1, run: header.run, taskSetHash: header.taskSetHash, agent: header.agent, model: header.model, replicates: header.replicates, tasks: header.tasks.length,
    preregistration: header.preregistration ?? null, arms: summaries, notRun,
    invalidRecords: records.filter((r) => r.invalid.length).map((r) => ({ arm: r.arm, task: r.task, replicate: r.replicate, reasons: r.invalid })),
    verdicts: [],
  };
  report.verdicts = verdicts(report);
  return report;
}

/** The preregistered decision rules (bench/prereg/defects-at-done-v1.md). Any missing or invalid record makes a verdict "not evaluable", never a pass. */
export function verdicts(report: Report): Verdict[] {
  if (!report.preregistration) return [];
  const gw = report.arms.find((a) => a.arm === 'groundwork'), native = report.arms.find((a) => a.arm === 'native');
  const complete = !!gw && !!native && gw.invalid === 0 && native.invalid === 0 && !!gw.versusNative;
  const fmt = (i: Interval | null, unit = '') => i ? `${i.estimate.toFixed(2)}${unit} (95% CI ${i.low.toFixed(2)} to ${i.high.toFixed(2)})` : 'not measurable';
  const rule = (id: string, claim: string, interval: Interval | null | undefined, test: (i: Interval) => boolean, unit = ''): Verdict =>
    !complete ? { id, claim, passed: null, detail: 'Not evaluable: the native or GroundWork arm has missing or invalid records.' }
      : !interval ? { id, claim, passed: null, detail: 'Not evaluable: the metric was not measured for every compared task.' }
        : { id, claim, passed: test(interval), detail: fmt(interval, unit) };
  const v = gw?.versusNative;
  const all = [
    rule('H1', 'GroundWork leaves at least 50% fewer defects at done than the native agent', v?.defectReductionPct, (i) => i.estimate >= 50 && i.low > 0, '%'),
    rule('H2', 'Task success does not drop (difference above -5 points)', v?.successDifferencePts, (i) => i.low > -5, ' pts'),
    rule('H3', 'Wall time is within 5% of native', v?.timeRatio, (i) => i.low >= 0.95 && i.high <= 1.05, 'x'),
    rule('H4', 'Provider-billed tokens are no worse than native', gw && gw.tokensReported === gw.valid && native!.tokensReported === native!.valid ? v?.tokenRatio : null, (i) => i.high <= 1, 'x'),
  ];
  const others = report.arms.filter((a) => a.arm !== 'native' && !a.arm.startsWith('groundwork'));
  const expectedOthers = ['serena', 'codebase-memory', 'augment'];
  const lowest = complete && expectedOthers.every((id) => others.some((a) => a.arm === id && a.invalid === 0));
  all.push(!lowest ? { id: 'H5', claim: 'GroundWork has the lowest defect rate of all arms', passed: null, detail: `Not evaluable: needs complete, valid runs of ${expectedOthers.join(', ')}.` }
    : { id: 'H5', claim: 'GroundWork has the lowest defect rate of all arms', passed: [native!, ...others].every((a) => gw!.defectsPerTask! < a.defectsPerTask!),
      detail: [gw!, native!, ...others].map((a) => `${a.arm} ${a.defectsPerTask!.toFixed(2)}`).join(', ') });
  return all;
}

const pct = (x: number | null) => x === null ? 'n/a' : `${(100 * x).toFixed(0)}%`;
const num = (x: number | null, digits = 2) => x === null ? 'n/a' : x.toFixed(digits);
const ci = (i: Interval | null | undefined, digits = 1, unit = '') => i ? `${i.estimate.toFixed(digits)}${unit} [${i.low.toFixed(digits)}, ${i.high.toFixed(digits)}]` : 'n/a';
const status = (r: Report) => r.preregistration ? `Preregistered run (${r.preregistration.file} at ${r.preregistration.commit.slice(0, 12)}, committed ${r.preregistration.committedAt}).`
  : 'Exploratory run without a committed preregistration. It supports no claim.';
function rows(r: Report): string[][] {
  return r.arms.map((a) => [a.arm, a.armVersion, `${a.valid}/${a.expected}`, num(a.defectsPerTask), pct(a.successRate), ci(a.versusNative?.defectReductionPct, 1, '%'),
    ci(a.versusNative?.successDifferencePts, 1), ci(a.versusNative?.timeRatio, 2, 'x'), a.tokensReported === a.valid ? ci(a.versusNative?.tokenRatio, 2, 'x') : 'n/a',
    a.meanTokens === null ? 'not reported' : Math.round(a.meanTokens).toLocaleString('en-US'), a.meanWallMs === null ? 'n/a' : `${(a.meanWallMs / 1000).toFixed(1)}s`]);
}
const HEAD = ['Arm', 'Version', 'Valid', 'Defects per task', 'Success', 'Defect reduction vs native', 'Success difference (pts)', 'Time vs native', 'Tokens vs native', 'Mean tokens', 'Mean time'];

export function markdown(r: Report): string {
  const table = (head: string[], body: string[][]) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map((b) => `| ${b.join(' | ')} |`)].join('\n');
  return [`# DefectsAtDone: run ${r.run}`, '', status(r), '',
    `Agent ${r.agent}, model ${r.model}, ${r.tasks} tasks x ${r.replicates} replicates. Task set ${r.taskSetHash.slice(0, 16)}. Intervals are 95% paired bootstrap intervals over tasks.`, '',
    table(HEAD, rows(r)), '',
    '## Defects by type (valid records)', '', table(['Arm', ...DEFECTS], r.arms.map((a) => [a.arm, ...DEFECTS.map((d) => String(a.defects[d]))])), '',
    ...(r.verdicts.length ? ['## Preregistered verdicts', '', table(['', 'Claim', 'Verdict', 'Evidence'], r.verdicts.map((v) => [v.id, v.claim, v.passed === null ? 'NOT EVALUABLE' : v.passed ? 'PASS' : 'FAIL', v.detail])), ''] : []),
    '## Arms not run', '', ...(r.notRun.length ? r.notRun.map((n) => `- ${n.arm}: ${n.reason}`) : ['None.']), '',
    '## Invalid records', '', ...(r.invalidRecords.length ? r.invalidRecords.map((i) => `- ${i.arm} / ${i.task} #${i.replicate}: ${i.reasons.join('; ')}`) : ['None.']), ''].join('\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** A static, dependency-free leaderboard page. Arms are ordered by defects per task; invalid and missing arms stay on the page. */
export function leaderboard(r: Report): string {
  const body = rows(r).map((row, i) => ({ row, key: r.arms[i]!.defectsPerTask ?? Infinity })).sort((a, b) => a.key - b.key)
    .map(({ row }) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('\n');
  const list = (items: string[]) => items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p>None.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DefectsAtDone leaderboard</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:14px}th,td{border-bottom:1px solid #ddd;padding:.45rem .6rem;text-align:left;white-space:nowrap}
th{background:#f5f5f5}.note{background:#fff8e1;border-left:4px solid #e0a800;padding:.6rem .9rem}.wrap{overflow-x:auto}
</style></head><body>
<h1>DefectsAtDone leaderboard</h1>
<p class="note">${esc(status(r))}</p>
<p>Defects left in the code when the agent says it is done: invented calls, wrong arguments, duplicated logic, type errors, missed callers and failing tests.
Run <code>${esc(r.run)}</code>, agent ${esc(r.agent)}, model ${esc(r.model)}, ${r.tasks} tasks x ${r.replicates} replicates, task set <code>${esc(r.taskSetHash.slice(0, 16))}</code>.
Intervals are 95% paired bootstrap intervals over tasks.</p>
<div class="wrap"><table><thead><tr>${HEAD.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
${body}
</tbody></table></div>
${r.verdicts.length ? `<h2>Preregistered verdicts</h2><div class="wrap"><table><thead><tr><th></th><th>Claim</th><th>Verdict</th><th>Evidence</th></tr></thead><tbody>${r.verdicts.map((v) => `<tr><td>${v.id}</td><td>${esc(v.claim)}</td><td>${v.passed === null ? 'NOT EVALUABLE' : v.passed ? 'PASS' : 'FAIL'}</td><td>${esc(v.detail)}</td></tr>`).join('')}</tbody></table></div>` : ''}
<h2>Arms not run</h2>${list(r.notRun.map((n) => `${n.arm}: ${n.reason}`))}
<h2>Invalid records</h2>${list(r.invalidRecords.map((i) => `${i.arm} / ${i.task} #${i.replicate}: ${i.reasons.join('; ')}`))}
<p>Every record, transcript and the frozen graders are published with the run. Setup for each tool follows its own documentation; maintainers are invited to review it and rerun.</p>
</body></html>
`;
}

export function writeReport(directory: string, notRun: { arm: string; reason: string }[] = []): { report: Report; files: { json: string; markdown: string; html: string } } {
  const report = buildReport(directory, notRun);
  const files = { json: path.join(directory, 'report.json'), markdown: path.join(directory, 'report.md'), html: path.join(directory, 'leaderboard.html') };
  writeFileSync(files.json, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(files.markdown, markdown(report));
  writeFileSync(files.html, leaderboard(report));
  return { report, files };
}

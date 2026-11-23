// Tool calls per task for every recorded navigation and long-horizon run, recomputed
// from the checked-in graded evidence. Reads only; no agent or model is run.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const SUITES = ['nav', 'long-horizon'];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Seeded bootstrap over sessions of the difference in arm means (Groundwork minus baseline).
export function differenceInterval(baseline, groundwork) {
  if (!baseline.length || !groundwork.length || [...baseline, ...groundwork].some((x) => !Number.isFinite(x) || x < 0)) throw new Error('Expected finite, nonempty session means');
  let state = 0x7c0a11ed;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
  const draw = (xs) => mean(xs.map(() => xs[Math.floor(next() * xs.length)]));
  const values = Array.from({ length: 10_000 }, () => draw(groundwork) - draw(baseline)).sort((a, b) => a - b);
  return { low: values[249], high: values[9749] };
}

export function summarize(evidence, taskIds) {
  const arm = (condition) => {
    const captures = evidence.captures.filter((c) => c.condition === condition);
    if (!captures.length) throw new Error(`Missing ${condition} sessions`);
    if (new Set(captures.map((c) => c.run)).size !== captures.length) throw new Error(`Duplicate ${condition} run`);
    for (const c of captures) {
      if (c.samples.length !== taskIds.length || taskIds.some((id) => c.samples.filter((s) => s.task === id).length !== 1)) throw new Error(`Incomplete ${condition} session ${c.run}`);
      if (c.samples.some((s) => !Number.isSafeInteger(s.toolCalls) || s.toolCalls < 0)) throw new Error(`Invalid tool-call count in ${condition} session ${c.run}`);
    }
    const samples = captures.flatMap((c) => c.samples);
    return {
      sessions: captures.length, attempts: samples.length, success: samples.filter((s) => s.success).length,
      toolCalls: samples.reduce((n, s) => n + s.toolCalls, 0),
      perSession: captures.map((c) => mean(c.samples.map((s) => s.toolCalls))),
    };
  };
  const b = arm('baseline'), g = arm('groundwork');
  if (b.sessions !== g.sessions) throw new Error('Unpaired session counts');
  const per = (a) => a.toolCalls / a.attempts;
  const strip = ({ perSession, ...rest }) => ({ ...rest, toolCallsPerTask: per(rest) });
  return {
    tasks: taskIds.length, protocol: evidence.captures.every((c) => c.protocol === 'stable-v1') ? 'stable-v1' : 'pre-stable',
    baseline: strip(b), groundwork: strip(g),
    difference: { mean: per(g) - per(b), ...differenceInterval(b.perSession, g.perSession) },
    taskDifferences: taskIds.map((id) => {
      const of = (condition) => mean(evidence.captures.filter((c) => c.condition === condition).map((c) => c.samples.find((s) => s.task === id).toolCalls));
      return { task: id, baseline: of('baseline'), groundwork: of('groundwork') };
    }),
  };
}

export function collect(base = root) {
  const rows = [];
  for (const suite of SUITES) {
    const dir = path.join(base, 'bench', suite);
    const versions = ['', ...readdirSync(dir).filter((d) => /^v\d+[a-z]?$/.test(d)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10) || (a < b ? -1 : 1))];
    for (const version of versions) {
      for (const results of ['results', 'exploratory-results']) {
        const file = path.join(dir, version, results, 'combined.evidence.json');
        if (!existsSync(file)) continue;
        const tasksFile = [path.join(dir, version, 'tasks.json'), path.join(dir, 'tasks.json')].find((f) => existsSync(f));
        const taskIds = JSON.parse(readFileSync(tasksFile, 'utf8')).tasks.map((t) => t.id);
        rows.push({ suite, run: version || 'v1', exploratory: results === 'exploratory-results', evidence: path.relative(base, file).split(path.sep).join('/'), ...summarize(JSON.parse(readFileSync(file, 'utf8')), taskIds) });
      }
    }
  }
  return rows;
}

const f = (n) => n.toFixed(2);
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`;
export function render(rows) {
  const table = (suite) => [
    `## ${suite}`, '',
    '| Run | Protocol | Sessions per arm | Tasks | Success, baseline / GroundWork | Tool calls per task, baseline | Tool calls per task, GroundWork | Difference [95% interval] |',
    '| --- | --- | ---: | ---: | --- | ---: | ---: | --- |',
    ...rows.filter((r) => r.suite === suite).map((r) => `| ${r.run}${r.exploratory ? ' (exploratory)' : ''} | ${r.protocol} | ${r.baseline.sessions} | ${r.tasks} | ${r.baseline.success}/${r.baseline.attempts} / ${r.groundwork.success}/${r.groundwork.attempts} | ${f(r.baseline.toolCallsPerTask)} | ${f(r.groundwork.toolCallsPerTask)} | ${signed(r.difference.mean)} [${signed(r.difference.low)}, ${signed(r.difference.high)}] |`),
    '',
  ];
  return [
    '# Tool calls per task', '',
    'Captured tool calls per task attempt in every recorded navigation and long-horizon run, with and without GroundWork. Generated by `npm run bench:tool-calls` from the checked-in graded evidence (`combined.evidence.json`); no agent or model is run and the recorded reports are not changed.', '',
    '- **Tool calls per task** is the arm\'s captured tool calls divided by its task attempts. A tool call is one action through the capture tools (shell, read, or a GroundWork MCP call); see `bench/README.md`.',
    '- **Difference** is GroundWork minus baseline, so a negative value means GroundWork used fewer calls. The interval is a seeded 95% bootstrap over sessions of the difference in arm means. An interval that includes zero does not show a difference.',
    '- Every recorded run is listed, including early and exploratory ones and those where GroundWork used more calls. Runs differ in GroundWork revision and protocol, so compare arms within a row, not across rows. `pre-stable` runs predate the 16-session protocol.',
    '- Success is shown beside the count because fewer calls only matter at equal success. Tokens and wall time are in each run\'s own report.',
    '- The agent was Devin; these are not Claude Code numbers and no competing tool was run.', '',
    ...SUITES.flatMap(table),
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = collect();
  writeFileSync(path.join(root, 'bench/tool-calls.json'), JSON.stringify({ version: 1, runs: rows }, null, 2) + '\n');
  writeFileSync(path.join(root, 'bench/TOOL-CALLS.md'), render(rows));
  console.log(render(rows));
}

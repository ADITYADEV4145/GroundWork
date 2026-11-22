import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tempDir } from '../selftest/fixtures.js';
import { captureSchema, evidenceSchema, gradeSchema, suiteSchema, type Capture, type Evidence, type Observation, type Sample, type Task } from './schema.js';
import { summarize, type BenchmarkSummary } from './stats.js';

const SOURCE = fileURLToPath(new URL('../../', import.meta.url));
const BENCH = path.join(SOURCE, 'bench');
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const suiteName = (name: string) => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid suite name');
  return name;
};

export function loadSuite(name: string, benchDir = BENCH) {
  const directory = path.join(benchDir, suiteName(name));
  const manifest = path.join(directory, 'tasks.json');
  const grader = path.join(directory, 'grade.mjs');
  if (!existsSync(manifest)) throw new Error(`No "${name}" benchmark suite. Run gw bench from the Groundwork source distribution.`);
  const bytes = readFileSync(manifest);
  return { directory, grader, suite: suiteSchema.parse(JSON.parse(bytes.toString('utf8'))),
    digest: createHash('sha256').update(bytes).update(readFileSync(grader)).digest('hex') };
}

export function loadEvidence(name: string, runs: number, benchDir = BENCH) {
  const { directory, suite, digest } = loadSuite(name, benchDir);
  const file = path.join(directory, 'evidence.json');
  if (!existsSync(file)) throw new Error(`No recorded ${name} evidence. Collect paired observations and run gw bench --suite ${name} --runs ${runs} --observations <dir>.`);
  const evidence = evidenceSchema.parse(readJson(file));
  if (digest !== evidence.suiteDigest) throw new Error(`Recorded ${name} evidence is stale: task manifest or verifier changed`);
  return { evidence, summary: summarize(suite, name, evidence, runs) };
}

interface Workspace {
  unpackWorkspace(source: string, revision: string, repo: string, root: string): void;
  applyPatch(root: string, patch?: string, previousStep?: string): void;
}

export async function withPinnedWorkspace<T>(revision: string, repo: string, run: (root: string, workspace: Workspace) => T | Promise<T>): Promise<T> {
  const workspace = await import(pathToFileURL(path.join(BENCH, 'workspace.mjs')).href) as Workspace;
  const temp = tempDir('gw-bench-');
  const root = path.join(temp, 'task');
  try {
    workspace.unpackWorkspace(SOURCE, revision, repo, root);
    return await run(root, workspace);
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
}
interface GradeContext {
  revision: string;
  condition: Capture['condition'];
  run: number;
  withWorkspace: <T>(run: (root: string) => T | Promise<T>) => Promise<T | false>;
}
type Grade = (task: Task, observation: Observation, ctx: GradeContext) => unknown;

async function score(task: Task, observation: Observation, ctx: GradeContext, grade: Grade): Promise<Sample> {
  if (ctx.condition === 'baseline' && observation.tools.some((tool) => tool.action === 'mcp' || tool.blocked)) {
    throw new Error(`Baseline task ${task.id} used the treatment`);
  }
  const result = gradeSchema.parse(await grade(task, observation, ctx));
  return {
    task: task.id,
    success: typeof result === 'boolean' ? result : result.success,
    ...(typeof result === 'boolean' || !result.metrics ? {} : { metrics: result.metrics }),
    toolCalls: observation.tools.length,
    toolOutputBytes: observation.tools.reduce((sum, tool) => sum + tool.bytes, 0),
    filesRead: new Set(observation.tools.flatMap((tool) => tool.file === undefined ? [] : [tool.file])).size,
    readBytes: observation.tools.reduce((sum, tool) => sum + (tool.readBytes ?? 0), 0),
    readBlocks: observation.tools.filter((tool) => tool.blocked).length,
    wallMs: observation.wallMs,
    startedAt: observation.startedAt,
    endedAt: observation.endedAt ?? observation.startedAt + observation.wallMs,
    toolSideMs: observation.tools.every((t) => t.durationMs !== undefined && t.startedAt !== undefined && t.endedAt !== undefined && t.endedAt >= t.startedAt)
      ? observation.tools.reduce((sum, t) => sum + t.durationMs!, 0) : undefined,
    usage: observation.usage,
  };
}

async function gradeEvidence(name: string, input: unknown[], runs: number) {
  const { grader, suite, digest } = loadSuite(name);
  const captures = input.filter((entry) => (entry as { suite?: unknown } | null)?.suite === name)
    .map((entry) => captureSchema.parse(entry));
  if (!captures.length) throw new Error(`No captures for ${name}`);
  const { grade } = await import(pathToFileURL(grader).href) as { grade: Grade };
  if (typeof grade !== 'function') throw new Error(`${grader} must export grade()`);
  const evidence: Evidence = { format: 1, suite: name, suiteDigest: digest, captures: [] };
  for (const capture of captures.sort((a, b) => a.run - b.run || a.condition.localeCompare(b.condition))) {
    const { observations, ...metadata } = capture;
    if (metadata.revision !== suite.revision) throw new Error(`Revision mismatch in ${name} ${capture.condition} replicate ${capture.run}`);
    const samples: Sample[] = [];
    for (const observation of observations) {
      const task = suite.tasks.find((item) => item.id === observation.task);
      if (!task) throw new Error(`Unknown task ${observation.task}`);
      const ctx: GradeContext = {
        condition: capture.condition, run: capture.run, revision: suite.revision,
        async withWorkspace(run) {
          return withPinnedWorkspace(suite.revision, task.repo, async (root, workspace) => {
            const sequence = !task.sequence ? [] : suite.tasks.filter((prior) =>
              prior.sequence === task.sequence && prior.step! < task.step!).sort((a, b) => a.step! - b.step!);
            if (task.sequence && (sequence.length !== task.step! - 1 ||
                sequence.some((prior, i) => prior.step !== i + 1 || prior.repo !== task.repo))) {
              throw new Error('Sequence steps must be contiguous from 1 and use the same repo');
            }
            try {
              for (const prior of sequence) workspace.applyPatch(root, observations.find((item) => item.task === prior.id)?.patch, prior.id);
              workspace.applyPatch(root, observation.patch);
            } catch {
              return false;
            }
            return await run(root);
          });
        },
      };
      samples.push(await score(task, observation, ctx, grade));
    }
    evidence.captures.push({ ...metadata, samples });
  }
  return { evidence, summary: summarize(suite, name, evidence, runs) };
}

export interface BenchmarkOptions {
  suite: string;
  runs: number;
  observations?: string;
  outputDir?: string;
}
export function benchmarkSuites(benchDir = BENCH, recordedOnly = false): string[] {
  return readdirSync(benchDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(benchDir, entry.name, 'tasks.json')) &&
      (existsSync(path.join(benchDir, entry.name, 'grade.mjs')) || existsSync(path.join(benchDir, entry.name, 'evidence.json'))) &&
      (!recordedOnly || existsSync(path.join(benchDir, entry.name, 'evidence.json'))))
    .map((entry) => entry.name).sort();
}
export async function runBenchmark(options: BenchmarkOptions) {
  if (!Number.isSafeInteger(options.runs) || options.runs < 1) throw new Error('--runs must be a positive integer');
  const replayAll = options.suite === 'all' && !options.observations;
  const names = options.suite === 'all' ? benchmarkSuites(BENCH, replayAll) : [suiteName(options.suite)];
  if (!names.length) throw new Error(replayAll ? 'No recorded benchmark suites found' : 'No benchmark suites found');
  const input = options.observations ? readCaptures(options.observations) : undefined;
  const reports = [];
  for (const name of names) reports.push(input ? await gradeEvidence(name, input, options.runs) : loadEvidence(name, options.runs));
  const directory = path.resolve(options.outputDir ?? path.join(process.cwd(), 'bench', 'results'));
  mkdirSync(directory, { recursive: true });
  const stem = path.join(directory, new Date().toISOString().replace(/[:.]/g, '-') + '-' + options.suite);
  writeFileSync(stem + '.json', JSON.stringify(reports, null, 2) + '\n');
  writeFileSync(stem + '.md', reports.map(({ summary }) => renderReport(summary)).join('\n---\n\n'));
  if (input) for (const { evidence } of reports) {
    writeFileSync(stem + '.' + evidence.suite + '.evidence.json', JSON.stringify(evidence) + '\n');
  }
  return { json: stem + '.json', markdown: stem + '.md', summaries: reports.map(({ summary }) => summary) };
}

function readCaptures(directory: string): unknown[] {
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(directory, entry.name)))
    .filter((entry) => entry !== null && typeof entry === 'object' && Object.hasOwn(entry, 'observations'));
}

const estimate = (n: number) => n.toFixed(1);
type Totals = BenchmarkSummary['baseline'];
const successes = (t: Totals) => `${t.success}/${t.attempts} (${estimate(100 * t.success / t.attempts)}%)`;
const range = (i: { median: number; low: number; high: number } | null, unit = '%') =>
  i ? `${estimate(i.median)}${unit} (95% bootstrap interval [${estimate(i.low)}, ${estimate(i.high)}]${unit})` : 'unavailable';

export function renderReport(report: BenchmarkSummary): string {
  const { baseline: b, groundwork: g } = report;
  const lines = [
    `# Groundwork benchmark: ${report.suite}`,
    '',
    `${report.agent}; model: ${report.model ?? 'not exposed'}; pinned source: \`${report.revision}\`.`,
    `Capture implementation: \`${report.captureRevision}\`.`,
    `${report.tasks.length} tasks × ${report.runs} paired repeats (${b.attempts} attempts per arm).`,
    '',
    '| Measure | Baseline | Groundwork |',
    '| --- | ---: | ---: |',
    `| Success | ${successes(b)} | ${successes(g)} |`,
    `| Estimated tool-output tokens (bytes / 4), mean per attempt | ${estimate(b.estimatedToolOutputTokens / b.attempts)} | ${estimate(g.estimatedToolOutputTokens / g.attempts)} |`,
    `| Captured tool calls | ${b.toolCalls} | ${g.toolCalls} |`,
    `| Distinct directly read files (summed across attempts) | ${b.filesRead} | ${g.filesRead} |`,
    `| Direct source-read bytes | ${b.readBytes} | ${g.readBytes} |`,
    `| Guarded reads blocked | ${b.readBlocks} | ${g.readBlocks} |`,
    `| Wall time, mean per attempt (s) | ${estimate(b.wallMs / b.attempts / 1000)} | ${estimate(g.wallMs / g.attempts / 1000)} |`,
    `| Provider input tokens per attempt | ${b.providerUsage ? estimate(b.providerUsage.inputTokens / b.attempts) : 'unavailable'} | ${g.providerUsage ? estimate(g.providerUsage.inputTokens / g.attempts) : 'unavailable'} |`,
    `| Provider output tokens per attempt | ${b.providerUsage ? estimate(b.providerUsage.outputTokens / b.attempts) : 'unavailable'} | ${g.providerUsage ? estimate(g.providerUsage.outputTokens / g.attempts) : 'unavailable'} |`,
    '',
    `Estimated tool-output token reduction (median of paired task reductions): **${range(report.estimatedToolOutputReductionPct)}**.`,
    `Provider input token reduction: ${range(report.modelInputReductionPct)}. Wall time reduction: ${range(report.wallTimeReductionPct)}.`,
    `Success delta (Groundwork minus baseline, median per task): ${range(report.successDeltaPercentagePoints, ' pp')}.`,
    '',
    '| Task category | Baseline success | Groundwork success |',
    '| --- | ---: | ---: |',
    ...report.categories.map(({ category, baseline, groundwork }) => `| ${category} | ${successes(baseline)} | ${successes(groundwork)} |`),
    '',
    '| Task | Category | Baseline success | Groundwork success | Baseline est. tokens/attempt | GW est. tokens/attempt | Reduction |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.tasks.map((task) =>
      `| ${task.task}${task.sequence ? ` (${task.sequence} #${task.step})` : ''} | ${task.category} | ${task.baseline.success}/${report.runs} | ${task.groundwork.success}/${report.runs} | ${estimate(task.baseline.estimatedToolOutputTokens / report.runs)} | ${estimate(task.groundwork.estimatedToolOutputTokens / report.runs)} | ${task.estimatedReductionPct === null ? 'N/A' : estimate(task.estimatedReductionPct) + '%'} |`),
    '',
  ];
  lines.push('## Session primary estimands', '', `Clock basis: ${report.sessionPrimary.basis}. Independent whole-session bootstrap; task-window measures above are secondary.`, '',
    '| Measure | Baseline mean | Groundwork mean | Reduction (95% CI) |', '| --- | ---: | ---: | --- |');
  for (const [name, value] of Object.entries(report.sessionPrimary).filter(([name]) => name !== 'basis')) {
    const metric = value as typeof report.sessionPrimary.elapsedMsPerTask;
    lines.push(`| ${name} | ${metric ? estimate(metric.baselineMean) : 'unavailable'} | ${metric ? estimate(metric.groundworkMean) : 'unavailable'} | ${range(metric?.reductionPct ?? null)} |`);
  }
  lines.push('', `Success guardrail (no category drop): ${report.noSuccessDrop ? 'met' : 'NOT MET'}.`,
    `Multiplicity-adjusted latency lower bound (97.5% per suite): ${report.sessionPrimary.elapsedMsPerTask?.reductionPct?.adjustedLow ?? 'unavailable'}%.`, '');
  if (Object.keys(report.metrics).length) lines.push(
    '| Suite metric | Baseline total | Groundwork total | Paired delta (GW – baseline, per task) | Task coverage |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...Object.entries(report.metrics).map(([name, values]) =>
      `| ${name} | ${values.baseline} | ${values.groundwork} | ${range(values.pairedDeltaPerTask, '')} | ${values.coverage}/${report.tasks.length} |`), '');
  lines.push(
    'Tool-output counts use captured UTF-8 response bytes only; they exclude system prompts, tool wrappers, hidden context and reasoning. Search snippets count toward response bytes, not directly read files/bytes.',
    'Reduction is computed from repeat totals within each task, then bootstrapped by task with a fixed seed. The interval describes this task set conditional on the recorded sessions; it does not measure variation across model runs or account for shared conversation context.',
    'Wall time is elapsed time between begin and finish, including agent/tool overhead but excluding workspace setup. No end-to-end input-token savings claim is made without provider usage.',
    '',
  );
  return lines.join('\n');
}

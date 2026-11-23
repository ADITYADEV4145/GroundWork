import type { Command } from 'commander';
import { runBenchmark } from '../../bench/runner.js';
import { globalOpts } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  const bench = program.command('bench')
    .description('score paired agent observations or reproduce a recorded benchmark report')
    .option('--suite <name>', 'suite to run; all replays suites with evidence, or grades every manifest with --observations', 'nav')
    .option('--runs <n>', 'paired replicates expected per task', '3')
    .option('--observations <dir>', 'grade trusted capture JSON files (runs suite tests against submitted changes)')
    .option('--output-dir <dir>', 'write dated JSON and Markdown reports here (default: bench/results)')
    .action(async (options: { suite: string; runs: string; observations?: string; outputDir?: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      try {
        const output = await runBenchmark({ ...options, runs: Number(options.runs) });
        emit(opts, output, () => `Report: ${output.markdown}\nData: ${output.json}`);
      } catch (err) {
        fail(opts, (err as Error).message);
      }
    });
  registerDefects(bench);
}

/** DefectsAtDone: agent-level head-to-head runs (bench/defects-at-done). */
function registerDefects(bench: Command): void {
  // --suite is declared on `gw bench` itself, so subcommands read it from there.
  const only = () => { if ((bench.opts() as { suite: string }).suite !== 'defects-at-done') throw new Error('This command needs --suite defects-at-done'); };
  const guard = (cmd: Command, action: () => Promise<void>) => action().catch((err: unknown) => fail(globalOpts(cmd), (err as Error).message));
  bench.command('run')
    .description('run agent arms on a suite in fresh workspaces, grade them and write the report and leaderboard')
    .requiredOption('--out <dir>', 'results directory outside this checkout')
    .requiredOption('--run <id>', 'run id; an existing run resumes and never overwrites records')
    .requiredOption('--model <model>', 'model every arm uses')
    .option('--arms <list>', 'comma-separated arm ids, or all', 'all')
    .option('--agent <id>', 'agent adapter from agents.json', 'claude-code')
    .option('--replicates <n>', 'sessions per task and arm', '3')
    .option('--tasks <list>', 'comma-separated task ids (default: every task)')
    .option('--max-turns <n>', 'agent turn budget per prompt', '60')
    .option('--timeout <seconds>', 'wall-time budget per prompt', '1200')
    .option('--prereg <file>', 'committed preregistration; without it the run is exploratory and supports no claim')
    .option('--cache <dir>', 'local mirrors of pinned repositories')
    .action((o: { out: string; run: string; model: string; arms: string; agent: string; replicates: string; tasks?: string; maxTurns: string; timeout: string; prereg?: string; cache?: string }, cmd: Command) => guard(cmd, async () => {
      only();
      const [{ runSuite }, { writeReport }] = await Promise.all([import('../../bench/defects/harness.js'), import('../../bench/defects/report.js')]);
      const opts = globalOpts(cmd);
      const result = await runSuite({ run: o.run, out: o.out, model: o.model, agent: o.agent, arms: o.arms.split(','), replicates: Number(o.replicates),
        maxTurns: Number(o.maxTurns), timeoutMs: Number(o.timeout) * 1000, ...(o.tasks ? { tasks: o.tasks.split(',') } : {}),
        ...(o.prereg ? { prereg: o.prereg } : {}), ...(o.cache ? { cache: o.cache } : {}), log: (line) => { if (!opts.json) process.stderr.write(line + '\n'); } });
      const { files } = writeReport(result.directory);
      emit(opts, { ...result, ...files }, () => `${result.records} sessions graded, ${result.skipped} already recorded, ${result.blocked.length} arms not run\nReport: ${files.markdown}\nLeaderboard: ${files.html}`);
    }));
  bench.command('leaderboard')
    .description('rebuild the report and static leaderboard page from a run directory')
    .argument('<run-dir>')
    .action((dir: string, _o: unknown, cmd: Command) => guard(cmd, async () => {
      const { writeReport } = await import('../../bench/defects/report.js');
      const { report, files } = writeReport(dir);
      emit(globalOpts(cmd), { ...files, verdicts: report.verdicts }, () => `Report: ${files.markdown}\nLeaderboard: ${files.html}`);
    }));
  bench.command('validate')
    .description('check that every task fails untouched and passes with zero defects on its reference solution')
    .action((_o: unknown, cmd: Command) => guard(cmd, async () => {
      only();
      const { validate } = await import('../../bench/defects/validate.js');
      const result = await validate();
      emit(globalOpts(cmd), result, () => result.rows.map((r) => `${r.task}: untouched ${r.unmodifiedFails ? 'fails' : 'PASSES (bad)'}, reference ${r.referencePasses ? 'passes' : 'FAILS'}, ${r.referenceDefects} defects`).join('\n'));
      if (!result.ok) process.exitCode = 1;
    }));
  bench.command('pr-study')
    .description('scan a list of public AI-written PRs from local mirrors and print aggregate counts only')
    .requiredOption('--list <file>', 'PR list (see bench/defects-at-done/README.md)')
    .requiredOption('--cache <dir>', 'local mirrors, one per repository')
    .action((o: { list: string; cache: string }, cmd: Command) => guard(cmd, async () => {
      const { prStudy } = await import('../../bench/defects/pr-study.js');
      const study = await prStudy(o.list, o.cache);
      emit(globalOpts(cmd), study, () => `${study.scanned}/${study.prs} PRs scanned (${study.failed} failed), ${study.prsWithFinding} with at least one tool finding on changed lines\n${Object.entries(study.findings).map(([k, n]) => `${k}: ${n}`).join('\n')}`);
    }));
}

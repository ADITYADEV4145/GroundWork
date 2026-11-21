import type { Command } from 'commander';
import { runBenchmark } from '../../bench/runner.js';
import { globalOpts } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  program.command('bench')
    .description('score paired agent observations or reproduce a recorded benchmark report')
    .option('--suite <name>', 'suite to run, or all installed suites', 'nav')
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
}

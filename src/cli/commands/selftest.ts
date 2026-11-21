import type { Command } from 'commander';
import { runSelftest } from '../../selftest/run.js';
import { globalOpts, repoRoot } from '../context.js';

export function register(program: Command): void {
  program
    .command('selftest')
    .description('phase gate: run the acceptance checks for this phase and every earlier one')
    .option('-t, --through <phase>', 'highest phase to check', '1')
    .option('--quick', 'skip slow checks')
    .option('--install-check', 'allow the networked packed-install check (also GW_SELFTEST_INSTALL=1)')
    .option('--sequences <n>', 'random edit sequences for the incremental check', '25')
    .action(async (o: { through: string; quick?: boolean; installCheck?: boolean; sequences: string }, cmd: Command) => {
      if (o.installCheck) process.env.GW_SELFTEST_INSTALL = '1';
      const opts = globalOpts(cmd);
      const report = await runSelftest(Number(o.through), { root: repoRoot(opts), quick: !!o.quick, sequences: Number(o.sequences) }, (r) => {
        if (!opts.json) process.stdout.write(`${r.skipped ? 'skip' : r.ok ? 'pass' : 'FAIL'}  [P${r.phase}] ${r.name} (${r.ms} ms)\n      ${r.detail.split('\n').join('\n      ')}\n`);
      });
      if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else process.stdout.write(report.ok ? `selftest through phase ${report.through}: PASS\n` : `selftest through phase ${report.through}: FAIL\n`);
      if (!report.ok) process.exitCode = 1;
    });
}

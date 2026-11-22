import type { Command } from 'commander';
import { checkRepository, formatCheck } from '../../reuse/check.js';
import { globalOpts, repoRoot } from '../context.js';
import { emit } from '../output.js';
import { renderTypes } from '../../types/index.js';

export function register(program: Command): void {
  program.command('check')
    .description('check changed code for duplication and abandoned implementations')
    .option('--base <ref>', 'compare the worktree against this commit (default: HEAD)')
    .option('--json', 'machine-readable output')
    .action(async (options: { base?: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      try {
        const report = await checkRepository(repoRoot(opts), { base: options.base });
        emit(opts, report, () => [formatCheck(report), report.types ? renderTypes({ ...report.types, findings: [] }, 400) : ''].filter(Boolean).join('\n'));
        if (report.blocked) process.exitCode = 1;
      } catch (error) {
        const message = (error as Error).message;
        emit(opts, { status: 'UNAVAILABLE', blocked: false, findings: [], error: message }, () => `Check unavailable (not a pass): ${message}`);
      }
    });
}

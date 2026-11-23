import type { Command } from 'commander';
import { architecture, renderArchitecture } from '../../index/architecture.js';
import { globalOpts, withIndex } from '../context.js';
import { emit } from '../output.js';

export function register(program: Command): void {
  program.command('architecture').description('packages, entry points, dependencies between packages, most-called helpers and naming conventions')
    .option('--budget <tokens>', 'token budget for the text output', '600')
    .option('--json', 'machine-readable output')
    .action(async (options: { budget: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      const budget = Number(options.budget);
      if (!Number.isInteger(budget) || budget < 100) throw new Error('budget must be an integer of at least 100');
      await withIndex(opts, async ({ db, root }) => {
        const report = architecture(db, root);
        emit(opts, report, () => renderArchitecture(report, budget));
      });
    });
}

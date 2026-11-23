import type { Command } from 'commander';
import { changeImpact, renderImpact } from '../../impact/index.js';
import { globalOpts, withIndex } from '../context.js';
import { emit } from '../output.js';

export function register(program: Command): void {
  program.command('impact').description('changed symbols, unchanged callers and affected tests')
    .option('--base <ref>', 'compare worktree against this commit')
    .option('--depth <n>', 'caller and import depth (1-5)')
    .option('--json', 'machine-readable output')
    .action(async (options: { base?: string; depth?: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      await withIndex(opts, async ({ db, root, config }) => {
        if (options.depth !== undefined) {
          const depth = Number(options.depth);
          if (!Number.isInteger(depth) || depth < 1 || depth > 5) throw new Error('depth must be an integer from 1 to 5');
          config.impact.depth = depth;
        }
        const report = await changeImpact(db, root, { base: options.base, sessionId: process.env.GW_SESSION_ID, config });
        emit(opts, report, () => renderImpact(report, config.impact.budgetTokens));
      });
    });
}

import type { Command } from 'commander';
import { report, sessionIds, summary } from '../../guards/ledger.js';
import { globalOpts, repoRoot } from '../context.js';
import { emit } from '../output.js';

export function register(program: Command): void {
  program.command('report').description('show measured local session savings').option('--session <id>').option('--all', 'aggregate every session')
    .action((options: { session?: string; all?: boolean }, cmd: Command) => {
      const opts = globalOpts(cmd);
      const root = repoRoot(opts);
      const ids = sessionIds(root);
      const result = report(root, options.all ? ids : options.session ? [options.session] : ids.slice(0, 1));
      emit(opts, result, () => [summary(result), `Estimate: ${result.method}`, ...Object.entries(result.guards).map(([name, s]) => `${name}: ~${Math.round(s.tokensSaved)} tokens saved; ${s.interventions} interventions; ${s.forced} forced`), `Duplicates prevented: ${result.duplicatesPrevented}; invented calls caught: ${result.inventedCallsCaught}`, `Forced: ${result.forced}; ignored: ${result.ignores}; force rate: ${(result.forceRate * 100).toFixed(1)}%`].join('\n'));
    });
}

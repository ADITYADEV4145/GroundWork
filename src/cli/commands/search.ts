import type { Command } from 'commander';
import { renderSearchHit, searchCode } from '../../search/index.js';
import { fitToBudget } from '../../util/tokens.js';
import { globalOpts, withIndex } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  program.command('search')
    .description('find code by plain-English intent (local and offline)')
    .argument('<query>')
    .option('--limit <n>', 'maximum results (1–100)', '20')
    .option('--json', 'machine-readable output')
    .action(async (query: string, options: { limit: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      try {
        await withIndex(opts, async (ctx) => {
          const hits = await searchCode(ctx.db, query, { ...ctx, limit: Number(options.limit) });
          emit(opts, hits, () => {
            if (!hits.length) return 'no matches';
            const fit = fitToBudget(hits, renderSearchHit, 1500);
            return fit.items.map(renderSearchHit).join('\n') + (fit.truncated ? '\n… more results omitted; narrow the query.' : '');
          });
        });
      } catch (error) { fail(opts, (error as Error).message); }
    });
}

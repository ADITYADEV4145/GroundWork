import { z } from 'zod';
import { searchCode, renderSearchHit } from '../../search/index.js';
import { fitToBudget } from '../../util/tokens.js';
import { defineTool } from '../registry.js';

export const searchCodeTool = defineTool({
  name: 'search_code',
  description: 'Find code by plain-English intent. Uses lexical search and optional installed local embeddings. Use find_code for known names.',
  inputSchema: {
    query: z.string().trim().min(1).max(2048).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Control characters are not supported'),
    limit: z.number().int().min(1).max(100).default(10),
  },
  async handler(args, ctx) {
    const hits = await searchCode(ctx.db, args.query, { ...ctx, limit: args.limit });
    if (!hits.length) return 'No matches.';
    const fit = fitToBudget(hits, renderSearchHit, 800);
    return fit.items.map(renderSearchHit).join('\n') + (fit.truncated ? '\n… more results omitted; narrow the query.' : '');
  },
});

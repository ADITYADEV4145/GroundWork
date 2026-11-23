import * as z from 'zod';
import { defineTool } from '../registry.js';

export const refactorSymbolTool = defineTool({
  name: 'refactor_symbol',
  description: 'Preview a TS/JS rename or body replacement. Inspect with gw refactor --json; apply with gw refactor --apply <preview-id>.',
  inputSchema: {
    symbol: z.string().min(1).max(1024).describe('ID, qualified name, or file:name.'),
    name: z.string().min(1).max(128).optional().describe('New identifier.'),
    body: z.string().min(1).max(32_768).optional().describe('Complete replacement body.'),
  },
  async handler({ symbol, name, body }, ctx) {
    if ((name === undefined) === (body === undefined)) throw new Error('Provide either name or body.');
    const { refactorSymbol, formatRefactor } = await import('../../refactor/index.js');
    return formatRefactor(await refactorSymbol(ctx, name !== undefined ? { symbol, name } : { symbol, body: body! }));
  },
});

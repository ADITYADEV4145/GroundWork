import * as z from 'zod';
import { defineTool } from '../registry.js';

export const refactorSymbolTool = defineTool({
  name: 'refactor_symbol',
  description: 'Preview a guarded TS/JS symbol rename or complete function/method body replacement. Read-only; returns the preview ID and guard results. Inspect the patch using gw refactor --json; then use gw refactor --apply <preview-id> to apply.',
  inputSchema: {
    symbol: z.string().min(1).max(1024).describe('Exact symbol ID, qualified name, or repo-relative file:name.'),
    name: z.string().min(1).max(128).optional().describe('New identifier; for rename only.'),
    body: z.string().min(1).max(32_768).optional().describe('Complete new function body; for body edit only.'),
  },
  async handler({ symbol, name, body }, ctx) {
    if ((name === undefined) === (body === undefined)) throw new Error('Provide either name or body.');
    const { refactorSymbol, formatRefactor } = await import('../../refactor/index.js');
    return formatRefactor(await refactorSymbol(ctx, name !== undefined ? { symbol, name } : { symbol, body: body! }));
  },
});

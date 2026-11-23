import { z } from 'zod';
import { defineTool } from '../registry.js';

export const checkTypesTool = defineTool({
  name: 'check_types',
  description: 'Check edited lines with the optional project TypeScript compiler or Pyright. Clean: ok.',
  inputSchema: { files: z.array(z.object({ file: z.string().min(1), lines: z.string().optional() }).strict()).min(1).max(100) },
  async handler({ files }, { root, config }) {
    const { typeCheck, renderTypes } = await import('../../types/index.js');
    const { parseLineSpec } = await import('../../grounding/ranges.js');
    return renderTypes(await typeCheck(root, files.map((f) => ({ file: f.file, ranges: f.lines ? parseLineSpec(f.lines) : null })), config), config.types.budgetTokens) || 'ok';
  },
});

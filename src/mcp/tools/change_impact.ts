import { z } from 'zod';
import { defineTool } from '../registry.js';

export const changeImpactTool = defineTool({
  name: 'change_impact',
  description: 'List changed symbols, callers and tests. complete:true needs no further lookup for this snapshot.',
  inputSchema: { base: z.string().optional(), depth: z.number().int().min(1).max(5).optional(), sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional() },
  async handler({ base, depth, sessionId }, { root, db, config }) {
    const { changeImpact, renderImpact } = await import('../../impact/index.js');
    const effective = depth === undefined ? config : { ...config, impact: { ...config.impact, depth } };
    return renderImpact(await changeImpact(db, root, { base, sessionId: sessionId ?? process.env.GW_SESSION_ID, config: effective }), config.impact.budgetTokens);
  },
});

import { z } from 'zod';
import { defineTool } from '../registry.js';

export const architectureTool = defineTool({
  name: 'architecture',
  description: 'Once per unfamiliar repo: packages, entry points, dependencies, common helpers and naming conventions.',
  inputSchema: { budget: z.number().int().min(100).max(2000).optional().describe('token budget, default 600') },
  async handler({ budget }, { root, db }) {
    const { architecture, renderArchitecture } = await import('../../index/architecture.js');
    return renderArchitecture(architecture(db, root), budget ?? 600);
  },
});

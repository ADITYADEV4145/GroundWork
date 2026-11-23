import { z } from 'zod';
import { defineTool } from '../registry.js';

export const architectureTool = defineTool({
  name: 'architecture',
  description: 'Once at the start of work in an unfamiliar repository: packages, entry points, which package depends on which, the most-called helpers to reuse, and naming conventions. Cached; do not repeat it in a session.',
  inputSchema: { budget: z.number().int().min(100).max(2000).optional().describe('token budget, default 600') },
  async handler({ budget }, { root, db }) {
    const { architecture, renderArchitecture } = await import('../../index/architecture.js');
    return renderArchitecture(architecture(db, root), budget ?? 600);
  },
});

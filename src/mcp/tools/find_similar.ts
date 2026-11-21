import { CandidateIndex } from '../../reuse/candidates.js';
import { findSimilar, renderSimilar, similarInputSchema } from '../../reuse/similar.js';
import { defineTool } from '../registry.js';

export const findSimilarTool = defineTool({
  name: 'find_similar',
  description: 'Find existing code before writing a symbol. Respond with a REUSE / EXTEND / NEW decision.',
  inputSchema: similarInputSchema.shape,
  async handler(args, { db, config }) {
    return renderSimilar(await findSimilar(new CandidateIndex(db, config.reuse.skipTests), args));
  },
});

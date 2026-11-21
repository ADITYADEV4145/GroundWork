import { CandidateIndex } from '../../reuse/candidates.js';
import { findSimilar, renderSimilar, similarInputSchema } from '../../reuse/similar.js';
import { defineTool } from '../registry.js';

export const findSimilarTool = defineTool({
  name: 'find_similar',
  description: 'Find existing code before writing a symbol. Respond with a REUSE / EXTEND / NEW decision.',
  inputSchema: similarInputSchema.shape,
  async handler(args, { root, db, config }) {
    const index = new CandidateIndex(db, config.reuse.skipTests);
    await index.prepareMeaning(root, config);
    return renderSimilar(await findSimilar(index, args));
  },
});

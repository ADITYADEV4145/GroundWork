import { similarInputSchema } from '../../reuse/similar-input.js';
import { defineTool } from '../registry.js';

export const findSimilarTool = defineTool({
  name: 'find_similar',
  description: 'Find reuse/extend matches before adding a non-trivial helper. Skip minor edits and known helpers. State REUSE/EXTEND/NEW and why.',
  inputSchema: similarInputSchema.shape,
  async handler(args, { root, db, config }) {
    const { cachedCandidates } = await import('../../reuse/candidate-cache.js');
    const { findSimilar, renderSimilar } = await import('../../reuse/similar.js');
    const index = await cachedCandidates(db, root, config);
    await index.prepareMeaning(root, config);
    return renderSimilar(await findSimilar(index, args));
  },
});

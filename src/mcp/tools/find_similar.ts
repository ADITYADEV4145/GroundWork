import { similarInputSchema } from '../../reuse/similar-input.js';
import { defineTool } from '../registry.js';

export const findSimilarTool = defineTool({
  name: 'find_similar',
  description: 'Before a new non-trivial helper/function, find existing code to reuse. Skip small edits and inline code. State REUSE <symbol> / EXTEND <symbol> / NEW because <reason>. Reuse unchanged evidence within a task.',
  inputSchema: similarInputSchema.shape,
  async handler(args, { root, db, config }) {
    const { cachedCandidates } = await import('../../reuse/candidate-cache.js');
    const { findSimilar, renderSimilar } = await import('../../reuse/similar.js');
    const index = await cachedCandidates(db, root, config);
    await index.prepareMeaning(root, config);
    return renderSimilar(await findSimilar(index, args));
  },
});

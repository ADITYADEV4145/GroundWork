import { similarInputSchema } from '../../reuse/similar-input.js';
import { defineTool } from '../registry.js';

export const findSimilarTool = defineTool({
  name: 'find_similar',
  description: 'Only for genuinely new non-trivial helpers/functions, find code to reuse; not once per task or for every edit. Skip small edits, inline code and already-confirmed helpers. Returns actionable matches; detail: full includes related matches. State REUSE <symbol> / EXTEND <symbol> / NEW because <reason>. Reuse unchanged evidence carried into context across continuing steps/sessions.',
  inputSchema: similarInputSchema.shape,
  async handler(args, { root, db, config }) {
    const { cachedCandidates } = await import('../../reuse/candidate-cache.js');
    const { findSimilar, renderSimilar } = await import('../../reuse/similar.js');
    const index = await cachedCandidates(db, root, config);
    await index.prepareMeaning(root, config);
    return renderSimilar(await findSimilar(index, args));
  },
});

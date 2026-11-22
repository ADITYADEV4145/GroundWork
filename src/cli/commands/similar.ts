import type { Command } from 'commander';
import { cachedCandidates } from '../../reuse/candidate-cache.js';
import { findSimilar, renderSimilar, similarInputSchema } from '../../reuse/similar.js';
import { globalOpts, withIndex } from '../context.js';
import { emit } from '../output.js';

export function register(program: Command): void {
  program.command('similar').description('find existing code to reuse before writing a symbol')
    .argument('<description>')
    .option('--name <name>', 'intended symbol name')
    .option('--signature <signature>', 'draft signature')
    .option('--code <code>', 'draft source code')
    .option('--language <language>', 'draft language (typescript, tsx, javascript, python)', 'typescript')
    .action(async (description: string, options: Record<string, string>, cmd: Command) => {
      const opts = globalOpts(cmd);
      const input = similarInputSchema.parse({ description, name: options.name, signature: options.signature, code: options.code, language: options.language });
      await withIndex(opts, async ({ root, db, config }) => {
        const index = await cachedCandidates(db, root, config);
        await index.prepareMeaning(root, config);
        const result = await findSimilar(index, input);
        emit(opts, result, () => renderSimilar(result));
      });
    });
}

import type { Command } from 'commander';
import { CandidateIndex } from '../../reuse/candidates.js';
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
      await withIndex(opts, async ({ db, config }) => {
        const result = await findSimilar(new CandidateIndex(db, config.reuse.skipTests), input);
        emit(opts, result, () => renderSimilar(result));
      });
    });
}

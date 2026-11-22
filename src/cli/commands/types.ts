import type { Command } from 'commander';
import { loadConfig } from '../../config/load.js';
import { changedFromGit } from '../../grounding/ranges.js';
import { renderTypes, typeCheck, typeNavigate } from '../../types/index.js';
import { globalOpts, repoRoot } from '../context.js';
import { emit } from '../output.js';
import { fitToBudget } from '../../util/tokens.js';

export function register(program: Command): void {
  const types = program.command('types').description('optional project compiler checks and TypeScript navigation').option('--json', 'machine-readable output');
  types.command('check').argument('[files...]').option('--base <ref>', 'compare against this commit').option('--json', 'machine-readable output')
    .action(async (files: string[], options: { base?: string }, cmd: Command) => {
      const opts = globalOpts(cmd), root = repoRoot(opts), config = loadConfig(root);
      const changed = files.length ? files.map((file) => ({ file, ranges: null })) : changedFromGit(root, options.base);
      const result = await typeCheck(root, changed, config, { base: options.base });
      emit(opts, result, () => renderTypes(result, config.types.budgetTokens) || 'ok');
      if (result.findings.some((f) => f.blocking)) process.exitCode = 1;
    });
  for (const operation of ['def', 'impl', 'refs'] as const) types.command(operation).argument('<file:line:col>').option('--json', 'machine-readable output')
    .action(async (target: string, _options: unknown, cmd: Command) => {
      const opts = globalOpts(cmd), root = repoRoot(opts);
      const config = loadConfig(root);
      const result = await typeNavigate(root, target, operation, config.types.timeoutMs);
      emit(opts, result, () => Array.isArray(result) ? fitToBudget(result, (item) => JSON.stringify(item), config.types.budgetTokens).items.map((item) => JSON.stringify(item)).join('\n') || 'ok' : JSON.stringify(result));
    });
}

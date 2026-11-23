import type { Command } from 'commander';
import { DEFAULT_REGISTRY, runUpdate, selfUpdateBlocker } from '../../update/update.js';
import { globalOpts } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  program
    .command('update')
    .description('update Groundwork from the npm registry; the download is installed only if its sha512 checksum matches')
    .option('--check', 'only report whether a newer version exists')
    .option('--registry <url>', 'npm registry to ask', DEFAULT_REGISTRY)
    .action(async (o: { check?: boolean; registry: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      const blocker = o.check ? null : selfUpdateBlocker();
      if (blocker) fail(opts, `gw update cannot replace this copy: ${blocker}`);
      let result;
      try {
        result = await runUpdate({ registry: o.registry, check: o.check });
      } catch (e) {
        fail(opts, `update failed, nothing was changed: ${(e as Error).message}`);
      }
      emit(opts, result, () =>
        result.status === 'installed'
          ? `updated ${result.current} -> ${result.latest} (sha512 verified)`
          : result.status === 'available'
            ? `${result.latest} is available (you have ${result.current}); run gw update`
            : `up to date (${result.current}; registry has ${result.latest})`,
      );
    });
}

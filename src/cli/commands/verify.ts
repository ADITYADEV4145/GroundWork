import path from 'node:path';
import type { Command } from 'commander';
import { changedFromGit, parseLineSpec, renderResults, verifyChanged, type ChangedFile } from '../../grounding/index.js';
import { toPosix } from '../../util/paths.js';
import { globalOpts, withIndex } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  program
    .command('verify')
    .description('grounding: flag invented imports, unknown calls/members and wrong arguments (exit 1 on definite errors)')
    .argument('[files...]', 'files to check (default with --changed: lines changed since --base)')
    .option('-l, --lines <ranges>', 'only these lines, e.g. 10-40,52 (one file)')
    .option('--changed', 'check lines changed since --base, plus untracked files')
    .option('--base <ref>', 'git base for --changed', 'HEAD')
    .option('--no-refresh', 'skip the incremental refresh')
    .action(async (files: string[], o: { lines?: string; changed?: boolean; base: string; refresh: boolean }, cmd: Command) => {
      const opts = globalOpts(cmd);
      if (!files.length && !o.changed) fail(opts, 'give files to check or --changed');
      if (o.lines && files.length !== 1) fail(opts, '--lines needs exactly one file');
      await withIndex({ ...opts, refresh: o.refresh }, ({ db, root, config }) => {
        let changed: ChangedFile[];
        try {
          changed = o.changed
            ? changedFromGit(root, o.base)
            : files.map((f) => ({ file: toPosix(path.relative(root, path.resolve(process.cwd(), f))), ranges: o.lines ? parseLineSpec(o.lines) : null }));
        } catch (e) {
          fail(opts, (e as Error).message);
        }
        const results = verifyChanged(db, root, changed, config);
        const blocking = results.some((r) => r.findings.some((f) => f.blocking));
        emit(opts, { results, blocking }, () => renderResults(results, 2000, { showUnchecked: !o.changed, showClean: true }));
        if (blocking) process.exitCode = 1;
      });
    });
}

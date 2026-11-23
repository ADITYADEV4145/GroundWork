import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { gwPath } from '../../util/paths.js';
import { globalOpts, repoRoot, withIndex } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  program.command('scan [target]')
    .description('one-screen report of invented calls, wrong arguments, duplicates and dead code; needs no setup')
    .option('--base <ref>', 'scan only what changed since this commit, and type-check those lines')
    .option('--json', 'machine-readable output')
    .option('--sarif', 'SARIF 2.1.0 for code scanning')
    .addHelpText('after', '\n[target] is a directory, a unified diff file, or - for a diff on stdin (e.g. gh pr diff <url> | gw scan -).')
    .action(async (target: string | undefined, options: { base?: string; sarif?: boolean }, cmd: Command) => {
      const opts = globalOpts(cmd);
      if (target && /^https?:\/\//.test(target)) fail(opts, `scan runs offline and does not fetch ${target}; pipe the diff instead: gh pr diff ${target} | gw scan -`);
      let diff: string | undefined;
      if (target === '-') diff = readFileSync(0, 'utf8');
      else if (target && existsSync(target) && statSync(target).isFile()) diff = readFileSync(target, 'utf8');
      else if (target) {
        if (!existsSync(target)) fail(opts, `no such directory or diff file: ${target}`);
        opts.root ??= path.resolve(target);
      }
      const { changedFromDiff, renderScan, scanRepository, toSarif } = await import('../../scan/index.js');
      const { changedFromGit } = await import('../../grounding/index.js');
      // A scan of a repository that never ran `gw init` must not leave its index showing up in git status.
      const state = gwPath(repoRoot(opts));
      if (!existsSync(state)) { mkdirSync(state, { recursive: true }); writeFileSync(path.join(state, '.gitignore'), '*\n'); }
      await withIndex(opts, async ({ db, root, config }) => {
        const changed = diff !== undefined ? changedFromDiff(diff) : options.base ? changedFromGit(root, options.base) : undefined;
        if (diff !== undefined && !changed!.length) fail(opts, 'the diff adds no lines');
        const report = await scanRepository(db, root, { config, changed, base: options.base });
        if (options.sarif) process.stdout.write(JSON.stringify(toSarif(report), null, 2) + '\n');
        else emit(opts, report, () => renderScan(report));
        if (report.findings.some((f) => f.confidence === 'high')) process.exitCode = 1;
      });
    });

  program.command('receipt')
    .description('counts for one agent session: calls checked, invented calls caught, duplicates prevented, time added')
    .option('--session <id>', 'session id (default: GW_SESSION_ID, else the most recent session)')
    .option('--png <file>', 'also write the receipt as a PNG image (rendered locally)')
    .option('--json', 'machine-readable output')
    .action(async (options: { session?: string; png?: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      const { buildReceipt, receiptLines } = await import('../../scan/receipt.js');
      const { sessionIds } = await import('../../guards/ledger.js');
      await withIndex(opts, async ({ db, root, config }) => {
        const id = options.session ?? process.env.GW_SESSION_ID ?? sessionIds(root)[0];
        if (!id) fail(opts, 'no recorded session in this repository');
        const receipt = await buildReceipt(db, root, id, config, id === sessionIds(root)[0]);
        if (options.png) {
          const { textPng } = await import('../../scan/png.js');
          writeFileSync(options.png, textPng(receiptLines(receipt)));
        }
        emit(opts, receipt, () => receiptLines(receipt).join('\n'));
      });
    });
}

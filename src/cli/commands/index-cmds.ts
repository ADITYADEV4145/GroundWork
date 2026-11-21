import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import { configPath } from '../../config/load.js';
import { refreshIndex, type RefreshResult } from '../../index/refresh.js';
import { indexStats } from '../../index/query.js';
import { initSqlBackend } from '../../store/db.js';
import { gwPath } from '../../util/paths.js';
import { globalOpts, repoRoot, withIndex } from '../context.js';
import { emit } from '../output.js';

function summary(r: RefreshResult): string {
  const parts = [`${r.files} files`, `+${r.added} ~${r.changed} -${r.removed}`, `${r.ms}ms`];
  if (r.skipped) parts.push(`${r.skipped} skipped`);
  if (r.partial) parts.push(`${r.partial} with syntax errors`);
  if (r.link) parts.push(`imports ${r.link.importsResolved}/${r.link.imports - r.link.importsExternal} internal resolved, calls ${r.link.callsResolved}/${r.link.calls} resolved`);
  return parts.join(' · ');
}

export function register(program: Command): void {
  program
    .command('init')
    .description('create .groundwork/ with a default config and build the index')
    .option('--embeddings', 'consent to downloading a local embedding model')
    .option('--model <id>', 'embedding model id (requires --embeddings)')
    .action(async (o: { embeddings?: boolean; model?: string }, cmd: Command) => {
      if (o.model && !o.embeddings) throw new Error('--model requires download consent via --embeddings.');
      const opts = globalOpts(cmd);
      const root = repoRoot(opts);
      mkdirSync(gwPath(root), { recursive: true });
      const created = !existsSync(configPath(root));
      // Only what the user sets goes in config.json, so a profile's presets fill in the rest.
      if (created) writeFileSync(configPath(root), '{}\n');
      // Keep the cache out of git but let teams commit config.json.
      writeFileSync(gwPath(root, '.gitignore'), '*\n!.gitignore\n!config.json\n');
      await initSqlBackend();
      const r = await refreshIndex(root);
      if (o.embeddings) {
        const { initializeEmbeddings } = await import('../../reuse/embeddings.js');
        await initializeEmbeddings(root, { consent: true, model: o.model });
      }
      emit(opts, { root, configCreated: created, index: r }, () => `groundwork initialised in ${root}\nindex: ${summary(r)}`);
    });

  program
    .command('index')
    .description('rebuild the whole index from scratch')
    .action(async (_o, cmd: Command) => {
      const opts = globalOpts(cmd);
      await initSqlBackend();
      const r = await refreshIndex(repoRoot(opts), { full: true });
      emit(opts, r, () => `index: ${summary(r)}`);
    });

  program
    .command('refresh')
    .description('re-parse only files that changed since the last run')
    .argument('[paths...]', 'limit to these repo-relative paths')
    .action(async (paths: string[], _o, cmd: Command) => {
      const opts = globalOpts(cmd);
      await initSqlBackend();
      const r = await refreshIndex(repoRoot(opts), paths.length ? { paths } : {});
      emit(opts, r, () => `refresh: ${summary(r)}`);
    });

  program
    .command('stats')
    .description('what is in the index')
    .action(async (_o, cmd: Command) => {
      const opts = globalOpts(cmd);
      await withIndex(opts, ({ db }) => {
        const s = indexStats(db);
        const internal = s.importsInternal || 1;
        emit(opts, s, () =>
          [
            `files    ${s.files} (${Object.entries(s.filesByLanguage).map(([k, v]) => `${k} ${v}`).join(', ')}), ${s.lines} lines, ${s.filesSkipped} skipped, ${s.filesPartial} with syntax errors`,
            `symbols  ${s.symbols} (${Object.entries(s.symbolsByKind).map(([k, v]) => `${k} ${v}`).join(', ')})`,
            `imports  ${s.imports}, internal resolved ${s.importsResolved}/${s.importsInternal} (${Math.round((100 * s.importsResolved) / internal)}%), external ${s.importsExternal}`,
            `calls    ${s.calls} (${Object.entries(s.callsByConfidence).map(([k, v]) => `${k === 'null' ? 'unresolved' : k} ${v}`).join(', ')})`,
            `literals ${s.literals}`,
            `backend  ${s.backend}`,
          ].join('\n'),
        );
      });
    });
}

import type { Command } from 'commander';
import { globalOpts, withIndex } from '../context.js';
import { emit, fail } from '../output.js';

export function register(program: Command): void {
  const deps = program.command('deps').description('checking beyond the repo: installed dependency surfaces, workspace packages and service contracts');

  deps
    .command('status', { isDefault: true })
    .description('what Groundwork can check outside the repo: workspace packages and local contracts')
    .action(async (_o: unknown, cmd: Command) => {
      const opts = globalOpts(cmd);
      const { repoRoot } = await import('../context.js');
      const { loadConfig } = await import('../../config/load.js');
      const { discoverWorkspaces } = await import('../../deps/workspaces.js');
      const { loadContracts } = await import('../../deps/contracts.js');
      const root = repoRoot(opts);
      const config = loadConfig(root);
      const ws = discoverWorkspaces(root, true);
      const c = loadContracts(root);
      const data = {
        enabled: config.deps.enabled,
        workspaces: ws.packages,
        contracts: { httpPaths: c.http.size, graphqlFields: c.graphql.query.size + c.graphql.mutation.size + c.graphql.subscription.size, protoServices: c.services.size },
      };
      emit(opts, data, () =>
        [
          `dependency checking: ${data.enabled ? 'on' : 'off (deps.enabled)'}`,
          `workspace packages: ${ws.packages.length}${ws.packages.length ? ` (${ws.packages.slice(0, 8).map((p) => `${p.name} [${p.kind}]`).join(', ')}${ws.packages.length > 8 ? ', …' : ''})` : ''}`,
          `contracts: ${data.contracts.httpPaths} OpenAPI paths, ${data.contracts.graphqlFields} GraphQL root fields, ${data.contracts.protoServices} protobuf services`,
          'run `gw deps build` to read every installed package now; otherwise each is read on first use.',
        ].join('\n'),
      );
    });

  deps
    .command('build')
    .description('read every installed package into the per-version cache (.groundwork/deps); no network')
    .action(async (_o: unknown, cmd: Command) => {
      const opts = globalOpts(cmd);
      await withIndex({ ...opts, refresh: false }, async ({ db, root, config }) => {
        const { DependencyChecker } = await import('../../deps/check.js');
        const start = performance.now();
        const summary = await new DependencyChecker(db, root, config).buildAll();
        const ms = Math.round(performance.now() - start);
        emit(opts, { ...summary, ms }, () =>
          `${summary.packages} packages in ${(ms / 1000).toFixed(1)}s (${Object.entries(summary.byEcosystem).map(([k, v]) => `${k} ${v}`).join(', ') || 'none found'}); ` +
          `${summary.closed} fully listed, ${summary.open} left open (not checked); ${summary.built} read, ${summary.cached} from cache.`,
        );
      });
    });

  deps
    .command('show')
    .description('the names an installed package exports, as the checker sees them')
    .argument('<module>', 'import specifier, e.g. lodash, requests.exceptions, github.com/google/uuid')
    .option('--from <file>', 'resolve as if imported from this file', 'package.json')
    .option('--limit <n>', 'names to print', '60')
    .action(async (module: string, o: { from: string; limit: string }, cmd: Command) => {
      const opts = globalOpts(cmd);
      await withIndex({ ...opts, refresh: false }, async ({ db, root, config }) => {
        const { DependencyChecker } = await import('../../deps/check.js');
        const hit = await new DependencyChecker(db, root, config).show(module, o.from);
        if (!hit) fail(opts, `${module}: not installed here (or not resolvable from ${o.from})`);
        const names = Object.keys(hit.surface.exports).sort();
        const limit = Math.max(1, Number(o.limit) || 60);
        emit(opts, { package: hit.ref, open: hit.surface.open, why: hit.surface.why ?? null, exports: hit.surface.exports }, () =>
          [
            `${hit.ref.name}@${hit.ref.version} (${hit.ref.ecosystem}) — ${hit.surface.open ? `open, not checked: ${hit.surface.why ?? 'surface cannot be fully listed'}` : `${names.length} names, checked`}`,
            names.slice(0, limit).join(', ') + (names.length > limit ? `, … ${names.length - limit} more` : ''),
          ].filter(Boolean).join('\n'),
        );
      });
    });
}

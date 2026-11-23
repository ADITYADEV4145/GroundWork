import { createInterface } from 'node:readline/promises';
import type { Command } from 'commander';
import { applySetup, planSetup } from '../../setup/apply.js';
import { CLIENT_NAMES, clientInfo, clientTargets, dedupeEdits, detectClients } from '../../setup/clients.js';
import { PROFILES, profileTarget } from '../../setup/targets.js';
import { globalOpts, repoRoot } from '../context.js';
import { emit, fail } from '../output.js';

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

export function register(program: Command): void {
  program
    .command('install')
    .description('detect your coding agents and wire Groundwork into each: hooks + MCP where the client has hooks, MCP + skill elsewhere')
    .option('-c, --client <clients>', `comma-separated: ${CLIENT_NAMES.join(',')}, or all (default: detected clients)`)
    .option('--command <cmd>', 'how clients launch Groundwork', 'gw')
    .option('--profile <profile>', `${PROFILES.join(' | ')} (see gw setup --help)`)
    .option('--remove', 'undo what gw install and gw setup added')
    .option('-y, --yes', 'apply without asking')
    .option('--dry-run', 'show the plan only')
    .action(async (o: { client?: string; command: string; profile?: string; remove?: boolean; yes?: boolean; dryRun?: boolean }, cmd: Command) => {
      const opts = globalOpts(cmd);
      const root = repoRoot(opts);
      const wanted: string[] = o.client === 'all' || (!o.client && o.remove) ? [...CLIENT_NAMES] : o.client ? o.client.split(',').map((s) => s.trim()).filter(Boolean) : detectClients(undefined, root);
      const bad = wanted.filter((c) => !clientInfo(c));
      if (bad.length) fail(opts, `unknown client(s): ${bad.join(', ')} (use ${CLIENT_NAMES.join(', ')})`);
      if (!wanted.length) fail(opts, `no supported client found; pass --client ${CLIENT_NAMES.join(',')}`);
      if (o.profile && !(PROFILES as readonly string[]).includes(o.profile)) fail(opts, `unknown profile: ${o.profile} (use ${PROFILES.join(', ')})`);
      const profile = o.profile as (typeof PROFILES)[number] | undefined;
      const partialRemove = o.remove === true && wanted.length < CLIENT_NAMES.length;
      const targets = dedupeEdits([
        ...clientTargets({ root, gw: o.command })
          .filter((t) => wanted.includes(t.agent))
          // The skill directory is shared, so removing some clients leaves it for the others.
          .map((t) => (partialRemove ? { ...t, edits: t.edits.filter((e) => e.kind !== 'skill') } : t)),
        ...((o.remove && !partialRemove) || profile ? [profileTarget(root, profile)] : []),
      ]);
      const mode = o.remove ? 'remove' : 'add';
      const plan = planSetup(root, targets, mode);
      const changing = plan.filter((c) => c.action !== 'unchanged');
      const clients = wanted.map((name) => {
        const info = clientInfo(name)!;
        return { client: info.name, label: info.label, enforcement: info.enforcement, enforced: info.enforced };
      });
      const enforcement = () => (o.remove ? [] : ['What Groundwork enforces per client:', ...clients.map((c) => `  ${c.label.padEnd(26)} ${c.enforcement === 'hooks' ? 'hooks + MCP' : 'MCP-only  '}  ${c.enforced}`)]);
      const changes = changing.map(({ agent, file, action }) => ({ agent, file, action }));
      const describe = () =>
        [changing.length ? `gw install ${o.remove ? '--remove ' : ''}will change:` : 'nothing to change', ...changing.map((c) => `  ${c.action.padEnd(7)} ${c.file}  (${c.agent})`), ...enforcement()].join('\n');
      if (o.dryRun || !changing.length) {
        emit(opts, { applied: false, changes, clients }, describe);
        return;
      }
      if (!o.yes) {
        if (!opts.json) process.stdout.write(describe() + '\n');
        if (!(await confirm('Apply these changes? [y/N] '))) fail(opts, 'not applied (rerun with --yes to apply without asking)');
      }
      applySetup(root, plan, mode);
      const notes = o.remove ? [] : targets.flatMap((t) => t.notes);
      emit(opts, { applied: true, changes, clients, notes }, () =>
        [
          `${o.remove ? 'removed' : 'installed'} ${clients.map((c) => c.label).join(', ')}`,
          ...(o.yes ? changing.map((c) => `  ${c.action.padEnd(7)} ${c.file}`) : []),
          ...(o.yes ? enforcement() : []),
          ...notes.map((n) => `note: ${n}`),
          ...(o.remove ? [] : ['next: gw init (if you have not built the index), then gw doctor']),
        ].join('\n'),
      );
    });
}

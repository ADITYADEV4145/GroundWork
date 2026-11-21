import { createInterface } from 'node:readline/promises';
import type { Command } from 'commander';
import type { AgentName } from '../../hooks/types.js';
import { applySetup, planSetup } from '../../setup/apply.js';
import { detectAgents, PROFILES, profileTarget, targetsFor } from '../../setup/targets.js';
import { globalOpts, repoRoot } from '../context.js';
import { emit, fail } from '../output.js';

const ALL: AgentName[] = ['claude', 'codex', 'cursor'];

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
    .command('setup')
    .description('wire Groundwork into Claude Code, Codex and Cursor (hooks + MCP); shows every change and asks first')
    .option('-a, --agent <agents>', `comma-separated: ${ALL.join(',')} (default: detected agents)`)
    .option('--command <cmd>', 'how agents launch Groundwork', 'gw')
    .option('--profile <profile>', `${PROFILES.join(' | ')}: minimal = navigation only, standard = + reuse and grounding warnings (default), strict = + blocking Stop gate`)
    .option('--remove', 'undo everything gw setup added')
    .option('-y, --yes', 'apply without asking')
    .option('--dry-run', 'show the plan only')
    .action(async (o: { agent?: string; command: string; profile?: string; remove?: boolean; yes?: boolean; dryRun?: boolean }, cmd: Command) => {
      const opts = globalOpts(cmd);
      const root = repoRoot(opts);
      const wanted = o.agent ? (o.agent.split(',').map((s) => s.trim()) as AgentName[]) : o.remove ? ALL : detectAgents();
      const bad = wanted.filter((a) => !ALL.includes(a));
      if (bad.length) fail(opts, `unknown agent(s): ${bad.join(', ')}`);
      if (!wanted.length) fail(opts, 'no supported agent found; pass --agent claude,codex,cursor');
      if (o.profile && !(PROFILES as readonly string[]).includes(o.profile)) fail(opts, `unknown profile: ${o.profile} (use ${PROFILES.join(', ')})`);
      const profile = o.profile as (typeof PROFILES)[number] | undefined;
      const targets = [
        ...targetsFor({ root, gw: o.command }).filter((t) => (wanted as string[]).includes(t.agent)),
        ...(o.remove || profile ? [profileTarget(root, profile)] : []),
      ];
      const mode = o.remove ? 'remove' : 'add';
      const plan = planSetup(root, targets, mode);
      const changing = plan.filter((c) => c.action !== 'unchanged');
      const describe = () =>
        [
          changing.length ? `gw setup ${o.remove ? '--remove ' : ''}will change:` : 'nothing to change',
          ...changing.map((c) => `  ${c.action.padEnd(7)} ${c.file}  (${c.agent})`),
        ].join('\n');
      if (o.dryRun || !changing.length) {
        emit(opts, { applied: false, changes: changing.map(({ agent, file, action }) => ({ agent, file, action })) }, describe);
        return;
      }
      if (!o.yes) {
        if (!opts.json) process.stdout.write(describe() + '\n');
        if (!(await confirm('Apply these changes? [y/N] '))) fail(opts, 'not applied (rerun with --yes to apply without asking)');
      }
      applySetup(root, plan, mode);
      const notes = o.remove ? [] : targets.flatMap((t) => t.notes);
      emit(opts, { applied: true, changes: changing.map(({ agent, file, action }) => ({ agent, file, action })), notes }, () =>
        [`${o.remove ? 'removed' : 'set up'} ${targets.map((t) => t.label).join(', ')}`, ...(o.yes ? changing.map((c) => `  ${c.action.padEnd(7)} ${c.file}`) : []), ...notes.map((n) => `note: ${n}`)].join('\n'),
      );
    });
}

import { Command } from 'commander';
import { VERSION } from '../util/version.js';

// Feature streams add a module under commands/ and one register() call below.
const program = new Command()
  .name('gw')
  .description('Groundwork: a live, local map of your codebase for coding agents')
  .version(VERSION)
  .option('--json', 'machine-readable output')
  .option('--root <dir>', 'repository root (default: git toplevel of cwd)');

const groups = [
  { names: ['types'], load: () => import('./commands/types.js') },
  { names: ['init', 'index', 'refresh', 'stats'], load: () => import('./commands/index-cmds.js') },
  { names: ['symbols', 'show'], load: () => import('./commands/query.js') },
  { names: ['doctor'], load: () => import('./commands/doctor.js') },
  { names: ['selftest'], load: () => import('./commands/selftest.js') },
  { names: ['setup'], load: () => import('./commands/setup.js') },
  { names: ['mcp', 'hook'], load: () => import('./commands/agent.js') },
  { names: ['run', 'report'], load: () => import('./commands/waste.js') },
  { names: ['verify'], load: () => import('./commands/verify.js') },
  { names: ['similar'], load: () => import('./commands/similar.js') },
  { names: ['check'], load: () => import('./commands/check.js') },
  { names: ['bench'], load: () => import('./commands/bench.js') },
];
let command: string | undefined;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root') { i++; continue; }
  if (args[i]!.startsWith('-')) continue;
  command = args[i];
  break;
}
const selected = groups.find((group) => group.names.includes(command ?? ''));
for (const group of selected ? [selected] : groups) (await group.load()).register(program);

program.parseAsync(process.argv).catch((e: unknown) => {
  process.stderr.write(`gw: ${(e as Error).message}\n`);
  process.exit(1);
});

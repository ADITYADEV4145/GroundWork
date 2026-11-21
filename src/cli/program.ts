import { Command } from 'commander';
import { VERSION } from '../util/version.js';
import { register as agent } from './commands/agent.js';
import { register as doctor } from './commands/doctor.js';
import { register as indexCmds } from './commands/index-cmds.js';
import { register as query } from './commands/query.js';
import { register as selftest } from './commands/selftest.js';
import { register as waste } from './commands/waste.js';
import { register as setup } from './commands/setup.js';
import { register as verify } from './commands/verify.js';
import { register as similar } from './commands/similar.js';
import { register as check } from './commands/check.js';
import { register as bench } from './commands/bench.js';

// Feature streams add a module under commands/ and one register() call below.
const program = new Command()
  .name('gw')
  .description('Groundwork: a live, local map of your codebase for coding agents')
  .version(VERSION)
  .option('--json', 'machine-readable output')
  .option('--root <dir>', 'repository root (default: git toplevel of cwd)');

for (const register of [indexCmds, query, doctor, selftest, setup, agent, waste, verify, similar, check, bench]) register(program);

program.parseAsync(process.argv).catch((e: unknown) => {
  process.stderr.write(`gw: ${(e as Error).message}\n`);
  process.exit(1);
});

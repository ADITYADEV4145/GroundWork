import type { Command } from 'commander';
import { register as run } from './run.js';
import { register as report } from './report.js';
export function register(program: Command): void { run(program); report(program); }

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { combine, options as beforeOptions } from './bench-combine.mjs';
import { EXPERIMENTS } from './bench-comparison.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function options(args) {
  let experiment = 'v2';
  const overrides = {};
  const usage = 'Use --experiment v2|v3|v4 --nav-captures DIR --lh-captures DIR --build DIR';
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value) throw new Error(usage);
    if (args[i] === '--experiment') experiment = value;
    else if (args[i] === '--nav-captures') overrides.navCaptures = path.resolve(value);
    else if (args[i] === '--lh-captures') overrides.lhCaptures = path.resolve(value);
    else if (args[i] === '--build') overrides.navBuild = overrides.lhBuild = path.resolve(value);
    else throw new Error(usage);
  }
  const selected = EXPERIMENTS.find((entry) => entry.directory === experiment && entry.revision);
  if (!selected) throw new Error(usage);
  return { ...beforeOptions([]), experiment, captureRevision: selected.revision,
    navCaptures: path.join(root, 'bench/nav', experiment, 'observations'),
    lhCaptures: path.join(root, 'bench/long-horizon', experiment, 'observations'),
    navBuild: root, lhBuild: root, ...overrides };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) combine(options(process.argv.slice(2)));

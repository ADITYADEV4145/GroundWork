import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { combine, options as beforeOptions } from './bench-combine.mjs';
import { AFTER_REVISION } from './bench-comparison.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export function options(args) {
  const config = { ...beforeOptions([]), experiment: 'v2', captureRevision: AFTER_REVISION,
    navCaptures: path.join(root, 'bench/nav/v2/observations'), lhCaptures: path.join(root, 'bench/long-horizon/v2/observations'),
    navBuild: root, lhBuild: root };
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value) throw new Error('Use --nav-captures DIR --lh-captures DIR --build DIR');
    if (args[i] === '--nav-captures') config.navCaptures = path.resolve(value);
    else if (args[i] === '--lh-captures') config.lhCaptures = path.resolve(value);
    else if (args[i] === '--build') config.navBuild = config.lhBuild = path.resolve(value);
    else throw new Error('Use --nav-captures DIR --lh-captures DIR --build DIR');
  }
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) combine(options(process.argv.slice(2)));

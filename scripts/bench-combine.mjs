import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { generate } from './bench-charts.mjs';
import { generateComparison } from './bench-comparison.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pins = { nav: 'e0c5f6bbc7a49f9399abf4227ef7253958d03a97', 'long-horizon': 'fa8657cbb6bc73dfb9a8011b891f55b6af499eda' };
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function options(args) {
  const result = { runs: 8, navCaptures: path.join(root, 'bench/nav/observations'), lhCaptures: path.join(root, 'bench/long-horizon/observations'),
    navBuild: path.join(os.homedir(), 'bench-compat-exact-nav'), lhBuild: path.join(os.homedir(), 'bench-compat-lh') };
  const keys = { '--runs': 'runs', '--nav-captures': 'navCaptures', '--lh-captures': 'lhCaptures', '--nav-build': 'navBuild', '--lh-build': 'lhBuild' };
  for (let i = 0; i < args.length; i += 2) {
    const key = keys[args[i]];
    if (!key || !args[i + 1]) throw new Error('Use --runs N --nav-captures DIR --lh-captures DIR --nav-build DIR --lh-build DIR');
    result[key] = key === 'runs' ? Number(args[i + 1]) : path.resolve(args[i + 1]);
  }
  if (!Number.isSafeInteger(result.runs) || result.runs < 1) throw new Error('--runs must be a positive integer');
  return result;
}

export function validateCaptures(directory, suite, runs, captureRevision = pins[suite]) {
  const rows = readdirSync(directory).filter((p) => p.endsWith('.json')).map((p) => ({ source: path.join(directory, p), capture: json(path.join(directory, p)) }))
    .filter(({ capture: c }) => !Number.isInteger(c.run) || c.run <= runs);
  const pairs = new Set();
  for (const { capture: c } of rows) {
    if (c.suite !== suite || c.captureRevision !== captureRevision || c.node !== 'v24.22.2' || c.agent !== 'Devin normal' || c.model !== null) throw new Error(`Unexpected ${suite} capture provenance`);
    const pair = `${c.condition}:${c.run}`;
    if (!['baseline', 'groundwork'].includes(c.condition) || !Number.isInteger(c.run) || c.run < 1 || c.run > runs || pairs.has(pair)) throw new Error(`Unexpected or duplicate ${pair}`);
    pairs.add(pair);
  }
  if (pairs.size !== runs * 2) throw new Error(`Expected ${runs * 2} complete ${suite} capture exports, found ${pairs.size}`);
  return rows;
}

export function planArchive(rows, directory, prefix) {
  return rows.flatMap(({ source, capture: c }) => {
    const target = path.join(directory, `${prefix}-${c.condition}-${c.run}.json`);
    if (!existsSync(target)) return [{ source, target }];
    if (!readFileSync(source).equals(readFileSync(target))) throw new Error(`Refusing to overwrite differing archived capture: ${target} (source: ${source})`);
    return [];
  });
}

export function combine(config) {
  const after = ['v2', 'v3', 'v4', 'v5', 'v6'].includes(config.experiment);
  if (config.experiment && !after) throw new Error('Unknown experiment; expected v2, v3, v4, v5 or v6');
  if (after && config.runs !== 8) throw new Error(`The ${config.experiment} comparison requires eight runs per arm`);
  const destination = after ? config.outputRoot ?? root : root;
  const suiteDir = (suite) => path.join(destination, 'bench', suite, ...(after ? [config.experiment] : []));
  const scratch = mkdtempSync(path.join(os.homedir(), 'bench-combine-'));
  const reports = [];
  for (const [suite, directory, build] of [['nav', config.navCaptures, config.navBuild], ['long-horizon', config.lhCaptures, config.lhBuild]]) {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: build, encoding: 'utf8' }).trim();
    const expected = after ? config.captureRevision : pins[suite];
    if (!expected || revision !== expected) throw new Error(`Expected ${suite} build checkout ${expected}, got ${revision}`);
    const rows = validateCaptures(directory, suite, config.runs, expected);
    const prefix = ['v3', 'v4', 'v5', 'v6'].includes(config.experiment) ? `${suite === 'nav' ? 'nav' : 'lh'}${config.experiment.slice(1)}` : (suite === 'nav' ? 'nav' : 'lh2');
    const copies = planArchive(rows, path.join(suiteDir(suite), 'observations'), prefix);
    const output = path.join(scratch, suite);
    const input = path.join(scratch, `${suite}-captures`);
    mkdirSync(input);
    for (const { source, capture: c } of rows) copyFileSync(source, path.join(input, `${c.condition}-${c.run}.json`));
    const command = ['dist/cli/main.js', 'bench', '--suite', suite, '--runs', String(config.runs), '--observations', input, '--output-dir', output];
    console.log(`Grading ${suite} at ${revision}: node ${command.join(' ')}`);
    console.log(execFileSync(process.execPath, command, { cwd: build, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    const resultFile = readdirSync(output).find((p) => p.endsWith('.json') && !p.endsWith('.evidence.json'));
    const data = json(path.join(output, resultFile));
    const report = data[0];
    const { summary: s } = report;
    if (data.length !== 1 || s.suite !== suite || s.runs !== config.runs || report.evidence.captures.some((c) => c.captureRevision !== expected)) throw new Error(`Invalid ${suite} grader report`);
    console.log(`${suite}: ${s.runs} runs, success ${s.baseline.success}/${s.baseline.attempts} vs ${s.groundwork.success}/${s.groundwork.attempts}; tool-output reduction ${JSON.stringify(s.estimatedToolOutputReductionPct)}; wall reduction ${JSON.stringify(s.wallTimeReductionPct)}`);
    reports.push({ suite, copies, report, markdown: readFileSync(path.join(output, resultFile.replace(/\.json$/, '.md')), 'utf8') });
  }
  for (const { suite, copies, report, markdown } of reports) {
    const dir = suiteDir(suite);
    mkdirSync(path.join(dir, 'results'), { recursive: true });
    mkdirSync(path.join(dir, 'observations'), { recursive: true });
    for (const { source, target } of copies) copyFileSync(source, target, constants.COPYFILE_EXCL);
    writeFileSync(path.join(dir, 'results/combined.evidence.json'), JSON.stringify(report.evidence, null, 2) + '\n');
    writeFileSync(path.join(dir, 'results/combined.json'), JSON.stringify([report], null, 2) + '\n');
    writeFileSync(path.join(dir, 'results/combined.md'), markdown);
  }
  if (after) generateComparison(destination);
  else generate();
  console.log(`Combined evidence, reports, raw exports and charts updated. Grader scratch: ${scratch}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) combine(options(process.argv.slice(2)));

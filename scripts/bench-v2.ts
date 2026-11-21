import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { z } from 'zod';
import { addedLines, aggregateReview, applyOverride, labelReuse, renderReport, renderReview, summarize } from './bench-v2-lib.js';
import type { Arm, Override, Result, ReviewRow, Run, Task } from './bench-v2-lib.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const defaults = path.join(project, 'bench/reuse-v2');
const options = new Command().description('Score Benchmark v2 patches; executes submitted code locally, use a disposable VM for untrusted runs.')
  .option('--runs <directory>', 'run inputs', path.join(defaults, 'runs'))
  .option('--out <directory>', 'results/report/review directory', defaults)
  .option('--tasks <file>', 'task suite', path.join(defaults, 'tasks.json'))
  .option('--labels <file>', 'human JSONL overrides (default: output directory/labels.jsonl)')
  .option('--cache <directory>', 'external clones and worktrees', path.join(os.homedir(), 'work/gw-bench-v2'))
  .option('--python <executable>', 'Python for acceptance tests (default: cache/venv/bin/python)')
  .option('--no-install', 'require preinstalled clone dependencies and Python environment')
  .parse().opts<{ runs: string; out: string; tasks: string; labels?: string; cache: string; python?: string; install: boolean }>();
const cache = path.resolve(options.cache), output = path.resolve(options.out);
if (cache === project || cache.startsWith(project + path.sep)) throw new Error('Benchmark cache must be outside the GroundWork repository.');
const main = path.join(project, 'dist/cli/main.js');
if (!existsSync(main)) throw new Error('Run npm run build first.');
mkdirSync(cache, { recursive: true });
mkdirSync(output, { recursive: true });
const slug = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const runSchema = z.object({ task_id: slug, arm: z.enum(['baseline', 'groundwork']), patch: z.string(), decisions: z.array(z.string()),
  notes: z.string(), session_id: z.string(), acus: z.number().finite().nonnegative().nullable() }).strict();
const overrideSchema = z.object({ task_id: slug, arm: z.enum(['baseline', 'groundwork']), label: z.enum(['reused', 'duplicate', 'unknown']),
  reviewer: z.string().trim().min(1), reasoning: z.string().trim().min(1) }).strict();
const taskSchema = z.object({ id: slug, repo: z.enum(['got', 'click', 'pytest']), url: z.string().url(), commit: z.string().regex(/^[a-f0-9]{40}$/),
  prompt: z.string(), helpers: z.array(z.object({ file: z.string(), name: z.string() })).min(1),
  acceptance: z.object({ path: z.string(), contents: z.string(), command: z.string() }), reference_patch: z.string() }).passthrough();
const tasks: Task[] = z.array(taskSchema).parse(JSON.parse(readFileSync(options.tasks, 'utf8')));
if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('Duplicate task IDs');
const pins = JSON.parse(readFileSync(path.join(project, 'bench/real-repos/repos.json'), 'utf8')).repositories as { id: string; url: string; end: string }[];
for (const task of tasks) {
  const pin = pins.find(r => r.id === task.repo);
  if (!pin || pin.url !== task.url || pin.end !== task.commit) throw new Error(`Unrecognized repository pin for ${task.id}`);
}
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const key = (r: { task_id: string; arm: Arm }) => `${r.task_id}/${r.arm}`;
const labelsFile = options.labels ?? path.join(output, 'labels.jsonl');
const overrides = new Map<string, Override>();
if (existsSync(labelsFile)) for (const line of readFileSync(labelsFile, 'utf8').split('\n').filter(s => s.trim())) {
  const label = overrideSchema.parse(JSON.parse(line));
  if (!tasks.some(t => t.id === label.task_id) || overrides.has(key(label))) throw new Error(`Unknown or duplicate override: ${key(label)}`);
  overrides.set(key(label), label);
}
const runs: Run[] = [];
if (existsSync(options.runs)) for (const entry of readdirSync(options.runs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  for (const arm of ['baseline', 'groundwork'] as const) {
    const file = path.join(options.runs, entry.name, `${arm}.json`);
    if (!existsSync(file)) continue;
    const run = runSchema.parse(readJson(file));
    if (run.task_id !== entry.name || run.arm !== arm || !tasks.some(t => t.id === run.task_id)) throw new Error(`Run identity mismatch: ${file}`);
    runs.push(run);
  }
}

function command(command: string, args: string[], cwd: string, env = process.env, timeout = 120_000) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  return { exitCode: result.status, stdout: result.stdout ?? '', output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}` };
}
function required(cmd: string, args: string[], cwd: string, timeout?: number) {
  const result = command(cmd, args, cwd, process.env, timeout);
  if (result.exitCode !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${result.output}`);
  return result.stdout.trim();
}
function git(clone: string, ...args: string[]) { return required('git', args, clone); }
const python = path.resolve(options.python ?? path.join(cache, 'venv/bin/python'));
const prepared = new Set<string>();
const versionFile = (task: Task) => path.join(cache, `pytest-metadata-${task.commit}`, '_pytest/_version.py');
function prepare(task: Task) {
  const clone = path.join(cache, task.repo);
  if (prepared.has(task.repo)) return clone;
  if (!existsSync(clone)) required('git', ['clone', '--no-checkout', task.url, clone], cache, 600_000);
  if (git(clone, 'config', '--get', 'remote.origin.url') !== task.url) throw new Error(`${clone}: unexpected origin`);
  git(clone, 'cat-file', '-e', `${task.commit}^{commit}`);
  if (task.repo === 'got' && !existsSync(path.join(clone, 'node_modules'))) {
    if (!options.install) throw new Error('Install got dependencies in the cache clone first.');
    // Dependency metadata must come from the pin, never from a submitted patch.
    const installTree = mkdtempSync(path.join(cache, 'install-'));
    git(clone, 'worktree', 'add', '--detach', installTree, task.commit);
    try {
      required('npm', ['install', '--ignore-scripts', '--package-lock=false'], installTree, 600_000);
      required('mv', [path.join(installTree, 'node_modules'), path.join(clone, 'node_modules')], cache);
    } finally { git(clone, 'worktree', 'remove', '--force', installTree); }
  }
  if (task.repo !== 'got' && !existsSync(python)) {
    if (!options.install || options.python) throw new Error('Provide a Python environment with pytest installed.');
    required('python3', ['-m', 'venv', path.join(cache, 'venv')], cache);
    required(python, ['-m', 'pip', 'install', 'pytest>=8,<9'], cache, 600_000);
  }
  if (task.repo === 'pytest' && !existsSync(versionFile(task))) {
    const installTree = mkdtempSync(path.join(cache, 'metadata-'));
    git(clone, 'worktree', 'add', '--detach', installTree, task.commit);
    try {
      required(python, ['-m', 'pip', 'install', '--no-deps', '--target', path.dirname(path.dirname(versionFile(task))), installTree], cache, 600_000);
    } finally { git(clone, 'worktree', 'remove', '--force', installTree); }
  }
  prepared.add(task.repo);
  return clone;
}
const results: Result[] = [];
for (const run of runs) {
  const task = tasks.find(t => t.id === run.task_id)!;
  let tree: string | undefined, clone: string | undefined, attached = false;
  const result: Result = { task_id: run.task_id, arm: run.arm, session_id: run.session_id, acus: run.acus,
    status: 'execution_failed', success: false, acceptance: null,
    check: { status: 'UNAVAILABLE', findings: [], error: 'Not executed' },
    reuse: { label: 'unknown', reason: 'Patch not evaluated', source: 'automated' } };
  try {
    clone = prepare(task);
    tree = mkdtempSync(path.join(cache, 'score-'));
    git(clone, 'worktree', 'add', '--detach', tree, task.commit);
    attached = true;
    const patch = spawnSync('git', ['apply', '--whitespace=nowarn', '-'], { cwd: tree, input: run.patch, encoding: 'utf8', timeout: 30_000 });
    if (patch.status !== 0) {
      result.status = 'apply_failed'; result.error = patch.error?.message ?? patch.stderr;
    } else {
      result.status = 'scored';
      const files = [...addedLines(run.patch)].flatMap(([file, lines]) => {
        const target = path.resolve(tree!, file);
        if (!target.startsWith(tree! + path.sep) || !existsSync(target)) return [];
        return [{ file, source: readFileSync(target, 'utf8'), addedLines: lines }];
      });
      result.reuse = labelReuse(task, files, task.repo === 'got' ? 'python3' : python);
      if (task.repo === 'got') symlinkSync(path.join(clone, 'node_modules'), path.join(tree, 'node_modules'), 'dir');
      const env = { ...process.env, PATH: `${path.dirname(python)}${path.delimiter}${process.env.PATH}`, PYTHONPATH: path.join(tree, 'src'), PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1' };
      const testFile = path.resolve(tree, task.acceptance.path);
      if (!testFile.startsWith(tree + path.sep) || existsSync(testFile)) throw new Error(`Unsafe or existing acceptance path: ${task.acceptance.path}`);
      mkdirSync(path.dirname(testFile), { recursive: true });
      writeFileSync(testFile, task.acceptance.contents);
      const generatedVersion = task.repo === 'pytest' ? path.join(tree, 'src/_pytest/_version.py') : undefined;
      const injectVersion = generatedVersion && !existsSync(generatedVersion);
      if (injectVersion) copyFileSync(versionFile(task), generatedVersion);
      try {
        const test = command('/bin/sh', ['-c', task.acceptance.command], tree, env);
        result.acceptance = { exitCode: test.exitCode, output: test.output };
        result.success = test.exitCode === 0;
      } finally {
        rmSync(testFile);
        if (injectVersion) rmSync(generatedVersion);
      }
      const init = command(process.execPath, [main, '--root', tree, 'init', '--json'], project);
      if (init.exitCode !== 0) result.check = { status: 'UNAVAILABLE', findings: [], error: `init failed: ${init.output}` };
      else {
        const check = command(process.execPath, [main, '--root', tree, 'check', '--base', task.commit, '--json'], project);
        try {
          const report = JSON.parse(check.stdout);
          if (!['PASS', 'WARN', 'BLOCK', 'UNAVAILABLE'].includes(report.status) || !Array.isArray(report.findings)) throw new Error('Invalid check report');
          if (check.exitCode === null) throw new Error(check.output);
          result.check = { status: report.status, findings: report.findings, ...(report.error ? { error: report.error } : {}) };
        } catch (error) { result.check = { status: 'UNAVAILABLE', findings: [], error: `${error}: ${check.output}` }; }
      }
    }
  } catch (error) {
    result.status = 'execution_failed'; result.success = false; result.error = String(error);
  } finally {
    if (tree && clone && attached) git(clone, 'worktree', 'remove', '--force', tree);
    else if (tree) rmSync(tree, { recursive: true, force: true });
  }
  result.reuse = applyOverride(result.reuse, overrides.get(key(run)));
  const directory = path.join(output, 'results', run.task_id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${run.arm}.json`), JSON.stringify(result, null, 2) + '\n');
  results.push(result);
  console.log(`${key(run)}: ${result.status}, success=${result.success}, ${result.reuse.label}, gw=${result.check.status}${result.error ? ` (${result.error})` : ''}`);
}
const reviewFile = path.join(output, 'block-review.json');
const review = aggregateReview(results, existsSync(reviewFile) ? readJson<ReviewRow[]>(reviewFile) : []);
const report = { ...summarize(results), expectedTasks: tasks.length, taskIds: {
  baseline: results.filter(r => r.arm === 'baseline').map(r => r.task_id), groundwork: results.filter(r => r.arm === 'groundwork').map(r => r.task_id),
} };
writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(output, 'report.md'), renderReport(report));
writeFileSync(reviewFile, JSON.stringify(review, null, 2) + '\n');
writeFileSync(path.join(output, 'block-review.md'), renderReview(review));
console.log(renderReport(report));

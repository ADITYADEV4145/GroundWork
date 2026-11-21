import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { armSchema, dataRoot, filesUnder, projectRoot, repos, tasks, taskSetHash, type Arm, type Task } from './tasks.js';

export interface RunManifest {
  version: 3;
  arm: Arm;
  taskSetHash: string;
  workspaces: { task: string; base: string }[];
}
export function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
export function commit(root: string, message: string): void {
  execFileSync('git', ['-c', 'user.name=Benchmark setup', '-c', 'user.email=benchmark@localhost', 'commit', '-qm', message], { cwd: root, stdio: 'pipe' });
}
export function materialize(task: Task, dir: string, root = dataRoot): void {
  if (existsSync(dir)) throw new Error(`Refusing to overwrite ${dir}`);
  mkdirSync(dir, { recursive: true });
  cpSync(path.join(root, 'repos', task.repo), dir, { recursive: true });
}
export function protocol(task: Task, arm: Arm): string {
  const check = arm === 'groundwork' ? '\nAfter EVERY edit step, before committing, run `node .benchmark/check.mjs <edited-file> [more-edited-files...]`. This runs the installed Groundwork CLI (`.tools/bin/gw --json verify ...`), records its feedback, and exits nonzero for definite grounding errors. Read the feedback, act on it, and commit that state before your next edit, including any error state before fixing it. The tool is also on PATH after `export PATH="$PWD/.tools/bin:$PATH"`. The index is already warm. Never delete or edit the feedback log.\n' : '';
  return `# ${task.id}\n\n${task.prompt}\n\n## Agent protocol\n\nWork only on this task in this workspace. Budget approximately 5–15 minutes. Read README.md and inspect the existing code. Preserve public signatures and service behavior; implement the requested workflow using repository APIs, not hard-coded answers. You may add helpers and tests.\n\nRun the visible tests freely. After EVERY edit step (including broken intermediate states), stage new source/test files explicitly if any, then run \`git commit -am "step: describe the edit"\`. Commit BEFORE starting the next edit, even if tests fail. Do not squash, amend, rewrite history, make merge commits, or modify existing service/test/config files. Leave all work committed. The evaluator reconstructs each step from these commits, so uncommitted intermediate fixes cannot be measured.\n${check}`;
}

function installGroundwork(dir: string): void {
  const install = path.join(dir, '.tools/gw');
  if (!existsSync(path.join(projectRoot, 'dist/cli/main.js'))) throw new Error('Run npm run build before preparing the Groundwork arm');
  mkdirSync(install, { recursive: true });
  cpSync(path.join(projectRoot, 'dist'), path.join(install, 'dist'), { recursive: true });
  cpSync(path.join(projectRoot, 'package.json'), path.join(install, 'package.json'));
  cpSync(path.join(projectRoot, 'package-lock.json'), path.join(install, 'package-lock.json'));
  const installed = spawnSync('npm', ['ci', '--offline', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: install, encoding: 'utf8', timeout: 120_000 });
  if (installed.status !== 0) throw new Error(`Offline gw installation failed (populate npm's cache first): ${installed.error?.message ?? installed.stderr}`);
  mkdirSync(path.join(dir, '.tools/bin'), { recursive: true });
  const launcher = path.join(dir, '.tools/bin/gw');
  writeFileSync(launcher, '#!/usr/bin/env node\nawait import("../gw/dist/cli/main.js");\n');
  chmodSync(launcher, 0o755);
  mkdirSync(path.join(dir, '.benchmark'), { recursive: true });
  writeFileSync(path.join(dir, '.benchmark/feedback.jsonl'), '');
  writeFileSync(path.join(dir, '.benchmark/check.mjs'), `import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
if (process.argv.length < 3) throw new Error('Supply every edited source file');
const args = ['--json', 'verify', ...process.argv.slice(2)];
const r = spawnSync(process.execPath, ['.tools/bin/gw', ...args], {encoding:'utf8'});
const base = spawnSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).stdout.trim();
appendFileSync('.benchmark/feedback.jsonl', JSON.stringify({base, files:process.argv.slice(2), stdout:r.stdout, stderr:r.stderr, status:r.status})+'\\n');
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
process.exitCode = r.status ?? 1;
`);
  execFileSync(process.execPath, [launcher, 'index'], { cwd: dir, stdio: 'pipe', timeout: 30_000 });
}

export function prepare(arm: Arm, repo: string, out: string, root = dataRoot): RunManifest {
  armSchema.parse(arm);
  if (!repos.includes(repo as typeof repos[number])) throw new Error(`Unknown repo ${repo}`);
  out = path.resolve(out);
  if (out === projectRoot || out.startsWith(projectRoot + path.sep)) throw new Error('Prepare workspaces outside the harness checkout');
  const hash = taskSetHash(root), manifestPath = path.join(out, 'run.json');
  mkdirSync(out, { recursive: true });
  const manifest: RunManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as RunManifest
    : { version: 3, arm, taskSetHash: hash, workspaces: [] };
  if (manifest.version !== 3 || manifest.arm !== arm || manifest.taskSetHash !== hash) throw new Error('Output directory contains a different arm/task set');
  const selected = tasks(root).filter((t) => t.repo === repo);
  if (selected.some((t) => existsSync(path.join(out, t.id)))) throw new Error('Selected task workspaces already exist; choose a fresh output directory');
  for (const task of selected) {
    const dir = path.join(out, task.id);
    materialize(task, dir, root);
    writeFileSync(path.join(dir, 'TASKS.md'), protocol(task, arm));
    git(dir, 'init', '-q');
    if (arm === 'groundwork') installGroundwork(dir);
    const tracked = filesUnder(path.join(root, 'repos', repo));
    git(dir, 'add', '--', ...tracked, 'TASKS.md', ...(arm === 'groundwork' ? ['.benchmark/check.mjs', '.benchmark/feedback.jsonl'] : []));
    commit(dir, 'benchmark: initial task');
    manifest.workspaces.push({ task: task.id, base: git(dir, 'rev-parse', 'HEAD') });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }
  writeFileSync(path.join(out, 'TASKS.md'), tasks(root).filter((t) => manifest.workspaces.some((w) => w.task === t.id)).map((t) => protocol(t, arm)).join('\n---\n\n'));
  return manifest;
}

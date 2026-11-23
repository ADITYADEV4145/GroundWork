import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataRoot, filesUnder, type Repo, type Task } from './tasks.js';

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function commit(root: string, message: string, allowEmpty = false): void {
  git(root, '-c', 'user.name=Benchmark setup', '-c', 'user.email=benchmark@localhost', 'commit', '-qm', message, ...(allowEmpty ? ['--allow-empty'] : []));
}

/**
 * Creates a clean task workspace and returns its base commit. Fixture repos are copied; git repos are checked out
 * at their pinned SHA from `cache` (a local mirror made by the operator; the harness never fetches during a run).
 * Hidden checks, traps and reference solutions are never copied in.
 */
/** Commits what an arm's setup wrote, so grading sees only the agent's own change. Index state stays untracked. */
export function snapshotSetup(dir: string): string {
  git(dir, 'add', '-A', '--', '.', ':(exclude).groundwork');
  commit(dir, 'benchmark: arm setup', true);
  return git(dir, 'rev-parse', 'HEAD');
}

export function materialize(repo: Repo, dir: string, options: { root?: string; cache?: string } = {}): string {
  if (existsSync(dir)) throw new Error(`Refusing to overwrite ${dir}`);
  mkdirSync(dir, { recursive: true });
  if (repo.source.kind === 'fixture') {
    cpSync(path.join(options.root ?? dataRoot, 'repos', repo.id), dir, { recursive: true });
  } else {
    const mirror = path.join(options.cache ?? '', repo.id);
    if (!options.cache || !existsSync(mirror)) throw new Error(`No local mirror of ${repo.id}; clone ${repo.source.url} into ${mirror} first`);
    const archive = execFileSync('git', ['archive', repo.source.sha], { cwd: mirror, maxBuffer: 1024 * 1024 * 1024 });
    execFileSync('tar', ['-xf', '-'], { cwd: dir, input: archive });
  }
  git(dir, 'init', '-q', '--template=');
  git(dir, 'add', '-A');
  commit(dir, 'benchmark: pinned task workspace');
  return git(dir, 'rev-parse', 'HEAD');
}

/** Copies a reference solution (an overlay of files) into a workspace. Used only by validation and tests. */
export function applyReference(task: Task, dir: string, root = dataRoot): void {
  const overlay = path.join(root, 'reference', task.id);
  if (!existsSync(overlay)) throw new Error(`${task.id}: no reference solution`);
  for (const file of filesUnder(overlay)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    cpSync(path.join(overlay, file), path.join(dir, file));
  }
}

export function taskPrompt(task: Task, turn = 0): string {
  const text = turn === 0 ? task.prompt : task.turns[turn - 1]?.prompt;
  if (!text) throw new Error(`${task.id}: no turn ${turn}`);
  return `${text}\n\nWork only in this repository. Run the existing tests. Say "done" only when you believe the change is complete and correct; your workspace is graded exactly as you leave it.`;
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

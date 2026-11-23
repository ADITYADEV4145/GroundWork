import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Grounder } from '../../grounding/verify.js';
import { changedFromGit } from '../../grounding/ranges.js';
import { refreshIndex } from '../../index/refresh.js';
import { indexDbPath } from '../../index/store.js';
import { initSqlBackend, openDb } from '../../store/db.js';
import { DEFECTS, dataRoot, projectRoot, type Defect, type Repo, type Task } from './tasks.js';

/** Frozen grader for DefectsAtDone. Its source is part of the task-set hash: changing it invalidates stored results. */
export const GRADER_VERSION = 1;

export interface DefectItem { defect: Defect; file: string; line?: number; name: string; evidence: string }
export interface Grade {
  task: string;
  success: boolean;
  hiddenPassed: boolean;
  visiblePassed: boolean;
  defects: Record<Defect, number>;
  totalDefects: number;
  items: DefectItem[];
  /** Checks that could not run. A grade with any entry here is invalid, never a silent zero. */
  invalid: string[];
}

const TS_INVENTED = new Set([2304, 2305, 2307, 2339, 2551, 2552, 2614, 2724]);
const TS_ARGUMENTS = new Set([2554, 2555, 2556, 2575, 2353]);
/** Tool state an arm may leave behind; never part of the agent's change. */
const TOOL_STATE = /(^|\/)(\.groundwork|\.serena|\.claude|\.codex|\.cursor|\.augment|\.codebase-memory|node_modules|__pycache__|\.git)\//;
/** A top-level declaration in an added file, and its name. Go functions may carry a receiver. */
const DECLARED = /^\s*(?:export\s+)?(?:async\s+)?(?:function|def|const|class|func)\s+(?:\([^)]*\)\s*)?([\w$]+)/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (name: string) => new RegExp(`(?<![\\w$])${escape(name)}(?![\\w$])`);

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

interface Run { ok: boolean; output: string; infra: string | null }
function run(cwd: string, command: string[], env: NodeJS.ProcessEnv = {}, timeout = 120_000): Run {
  const r = spawnSync(command[0]!, command.slice(1), { cwd, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...env } });
  const timedOut = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  return { ok: !r.error && r.status === 0, output: (r.stdout ?? '') + (r.stderr ?? ''), infra: r.error && !timedOut ? r.error.message : null };
}

/** Lines added since `base`, per file, including untracked files. */
export function addedLines(root: string, base: string): Map<string, { line: number; text: string }[]> {
  const out = new Map<string, { line: number; text: string }[]>();
  let file = '', line = 0;
  for (const row of git(root, 'diff', '--unified=0', '--no-color', '--no-renames', base, '--').split('\n')) {
    if (row.startsWith('+++ ')) { file = row.slice(4).replace(/^b\//, ''); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(row);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (row.startsWith('+') && file && file !== '/dev/null' && !TOOL_STATE.test(file)) {
      if (!out.has(file)) out.set(file, []);
      out.get(file)!.push({ line: line++, text: row.slice(1) });
    }
  }
  for (const f of git(root, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) if (!TOOL_STATE.test(f))
    out.set(f, readFileSync(path.join(root, f), 'utf8').split('\n').map((text, i) => ({ line: i + 1, text })));
  return out;
}

function tscDiagnostics(root: string): { items: { file: string; line: number; code: number; message: string }[]; infra: string | null } {
  const r = run(root, [process.execPath, path.join(projectRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json', '--noEmit', '--pretty', 'false']);
  if (r.infra) return { items: [], infra: r.infra };
  const items = [...r.output.matchAll(/^(.+?)\((\d+),\d+\): error TS(\d+): (.*)$/gm)]
    .map((m) => ({ file: m[1]!.split(path.sep).join('/'), line: Number(m[2]), code: Number(m[3]), message: m[4]! }));
  return { items, infra: !r.ok && !items.length ? `tsc failed without diagnostics: ${r.output.slice(0, 300)}` : null };
}

/** Added lines split at each top-level declaration, so that a helper is credited only through code that is actually called. */
function declarations(lines: { text: string }[]): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  for (const l of lines) {
    // A top-level comment documents the declaration after it, not the one before.
    if (/^(\/\/|#|\/\*| \*)/.test(l.text)) continue;
    const name = /^\S/.test(l.text) ? DECLARED.exec(l.text)?.[1] : undefined;
    const bound = /^(?:from\s+\S+\s+)?import\s+(?:type\s+)?(.*?)(?:\s+from\s.*)?;?\s*$/.exec(l.text)?.[1];
    // An import is a declaration of each name it binds, so an alias re-exported by an earlier step still leads to the helper.
    if (bound !== undefined) for (const part of bound.replace(/[{}()]/g, '').split(',')) {
      const alias = /([\w$]+)\s*$/.exec(part)?.[1];
      if (alias) out.push({ name: alias, body: l.text });
    }
    else if (name) out.push({ name, body: l.text });
    else if (out.length) out[out.length - 1]!.body += '\n' + l.text;
  }
  return out;
}

/** The bodies of the declarations `own` calls, directly or through one another. */
function reached(own: string, all: { name: string; body: string }[]): string {
  let text = '', rest = all;
  for (;;) {
    const hit = rest.filter((d) => word(d.name).test(own + '\n' + text));
    if (!hit.length) return text;
    text += hit.map((d) => d.body).join('\n') + '\n';
    rest = rest.filter((d) => !hit.includes(d));
  }
}

function goDiagnostics(root: string): { items: { file: string; line: number; message: string }[]; infra: string | null } {
  const r = run(root, ['go', 'vet', './...'], { GOFLAGS: '-mod=readonly', GOWORK: 'off' });
  if (r.infra) return { items: [], infra: r.infra };
  const items = [...r.output.matchAll(/^(?:vet: )?(?:\.\/)?([^\s:#]+\.go):(\d+):(?:\d+:)? (.*)$/gm)]
    .map((m) => ({ file: m[1]!.split(path.sep).join('/'), line: Number(m[2]), message: m[3]! }));
  return { items, infra: !r.ok && !items.length ? `go vet failed without diagnostics: ${r.output.slice(0, 300)}` : null };
}

async function grounding(root: string, base: string): Promise<DefectItem[]> {
  await initSqlBackend();
  await refreshIndex(root);
  const db = openDb(indexDbPath(root), { readonly: true });
  try {
    const grounder = new Grounder(db, root);
    return changedFromGit(root, base).flatMap((c) => grounder.verify(c.file, { ranges: c.ranges }).findings)
      .filter((f) => f.blocking && f.kind !== 'type')
      .map((f) => ({ defect: f.kind === 'arity' || f.kind === 'unknown-keyword' ? 'wrongArguments' as const : 'inventedCalls' as const,
        file: f.file, line: f.line, name: f.name, evidence: `index: ${f.message}` }));
  } finally { db.close(); }
}

/**
 * Counts defects left in `root` (the agent's workspace after it said done) relative to `base` (the pinned task commit).
 * Evidence comes from the compiler, the hidden check, the repository's own tests and the task's private trap;
 * the symbol index adds call-level findings and is deduplicated against compiler diagnostics on the same line.
 */
export async function grade(task: Task, repo: Repo, root: string, base: string, data = dataRoot): Promise<Grade> {
  const items: DefectItem[] = [], invalid: string[] = [];
  const added = addedLines(root, base);
  const changedFiles = new Set(added.keys());
  for (const f of git(root, 'diff', '--name-only', '--no-renames', base, '--').split('\n').filter(Boolean)) changedFiles.add(f);
  const onAdded = (file: string, line: number) => added.get(file)?.some((l) => l.line === line) ?? false;

  if ((repo.language === 'typescript' || repo.language === 'javascript') && existsSync(path.join(root, 'tsconfig.json'))) {
    const diagnostics = tscDiagnostics(root);
    if (diagnostics.infra) invalid.push(diagnostics.infra);
    for (const d of diagnostics.items) if (onAdded(d.file, d.line))
      items.push({ defect: TS_INVENTED.has(d.code) ? 'inventedCalls' : TS_ARGUMENTS.has(d.code) ? 'wrongArguments' : 'typeErrors',
        file: d.file, line: d.line, name: `TS${d.code}`, evidence: `tsc: ${d.message}` });
  }
  if (repo.language === 'go') {
    const diagnostics = goDiagnostics(root);
    if (diagnostics.infra) invalid.push(diagnostics.infra);
    for (const d of diagnostics.items) if (onAdded(d.file, d.line))
      items.push({ defect: 'typeErrors', file: d.file, line: d.line, name: 'go vet', evidence: `go vet: ${d.message}` });
  }
  try {
    for (const g of await grounding(root, base))
      if (!items.some((i) => i.file === g.file && i.line === g.line && i.defect !== 'typeErrors')) items.push(g);
  } catch (e) { invalid.push(`index check failed: ${(e as Error).message}`); }

  // Reuse: each existing helper named by the trap must be referenced from added code, otherwise the agent re-implemented it.
  // A compaction task whose last step was never written has nothing that could duplicate a helper.
  if (task.category === 'compaction' ? added.has(task.entry) : added.size && task.category === 'hidden-helper') {
    const join = (lines: { text: string }[]) => lines.map((l) => l.text).join('\n');
    // After compaction only the last step's file counts: it must use each helper itself, or call an earlier added declaration that does.
    const own = task.category === 'compaction' ? join(added.get(task.entry) ?? []) : join([...added.values()].flat());
    const through = task.category !== 'compaction' ? '' : reached(own, [...added].filter(([file]) => file !== task.entry).flatMap(([, lines]) => declarations(lines)));
    for (const ref of task.trap.existing) {
      const name = ref.split('#')[1]!.split('.').pop()!;
      if (!word(name).test(own) && !word(name).test(through)) items.push({ defect: 'duplicates', file: task.entry, name, evidence: `existing ${ref} is not used by the added code` });
    }
  }

  // Callers and docs: an affected file is missed when it was left untouched or still carries a stale name.
  // An agent that changed nothing has failed the task, not left callers behind.
  for (const file of added.size ? task.trap.affected : []) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const stale = task.category === 'near-name' ? undefined : task.trap.decoys.find((d) => word(d).test(readFileSync(full, 'utf8')));
    if (stale) items.push({ defect: 'missedCallers', file, name: stale, evidence: `still refers to ${stale}` });
    else if (!changedFiles.has(file) && task.category === 'ripple') items.push({ defect: 'missedCallers', file, name: path.basename(file), evidence: 'affected file was not updated' });
  }

  const visible = run(root, repo.test);
  if (visible.infra) invalid.push(`visible tests could not start: ${visible.infra}`);
  for (const test of task.affectedTests) {
    const r = run(root, [...repo.testOne, test]);
    if (r.infra) invalid.push(`${test} could not start: ${r.infra}`);
    else if (!r.ok) items.push({ defect: 'failingTests', file: test, name: path.basename(test), evidence: r.output.slice(-400) });
  }

  const script = path.join(data, 'hidden', task.hidden);
  const hidden = run(root, script.endsWith('.py') ? ['python3', script] : [process.execPath, '--experimental-strip-types', '--no-warnings', script],
    { WORKSPACE_DIR: root, TASK_ID: task.id, PYTHONPATH: root, PYTHONDONTWRITEBYTECODE: '1' }, 60_000);
  if (hidden.infra) invalid.push(`hidden check could not start: ${hidden.infra}`);

  const defects = Object.fromEntries(DEFECTS.map((d) => [d, items.filter((i) => i.defect === d).length])) as Record<Defect, number>;
  return { task: task.id, success: hidden.ok && visible.ok, hiddenPassed: hidden.ok, visiblePassed: visible.ok,
    defects, totalDefects: items.length, items, invalid };
}

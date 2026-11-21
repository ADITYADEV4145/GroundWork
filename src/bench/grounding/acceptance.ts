import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataRoot, projectRoot, tasks, type Task } from './tasks.js';
import { materialize } from './workspaces.js';

export interface AcceptanceCheck { id: string; passed: boolean; output: string }
export function acceptance(task: Task, dir: string, root = dataRoot): AcceptanceCheck[] {
  const python = task.repo === 'dispatch-desk';
  const results: AcceptanceCheck[] = [];
  const run = (id: string, executable: string, args: string[], env: NodeJS.ProcessEnv) => {
    const result = spawnSync(executable, args, { cwd: dir, encoding: 'utf8', timeout: 15_000, maxBuffer: 2 * 1024 * 1024, env });
    const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
    if (result.error && !timedOut) throw new Error(`Acceptance infrastructure failed: ${result.error.message}`);
    results.push({ id, passed: !timedOut && result.status === 0,
      output: (result.stdout ?? '') + (result.stderr ?? '') + (timedOut ? '\nAcceptance timed out after 15000 ms\n' : '') });
  };
  const env = { ...process.env, WORKSPACE_DIR: dir, TASK_ID: task.id, PYTHONPATH: dir, PYTHONDONTWRITEBYTECODE: '1' };
  if (!python) run('typescript', process.execPath, [path.join(projectRoot, 'node_modules/typescript/bin/tsc'), '-p', path.join(dir, 'tsconfig.json'), '--pretty', 'false'], env);
  for (let i = 1; i <= 4; i++) run(`scenario-${i}`, python ? 'python3' : process.execPath,
    python ? [path.join(root, 'hidden/dispatch-desk.py')] : ['--experimental-strip-types', path.join(root, `hidden/${task.repo}.mjs`)],
    { ...env, CASE_NUMBER: String(i) });
  return results;
}

export function validateReferences(root = dataRoot): { referencePassed: number; unmodifiedFailed: number; total: number; rows: { task: string; reference: boolean; unmodified: boolean }[] } {
  const work = mkdtempSync(path.join(os.tmpdir(), 'gw-v3-reference-'));
  try {
    const rows = tasks(root).map((task) => {
      const dir = path.join(work, task.id);
      materialize(task, dir, root);
      const unmodifiedChecks = acceptance(task, dir, root);
      const unmodified = unmodifiedChecks.every((c) => c.passed);
      // A broken toolchain is not evidence that an unimplemented task failed correctly.
      if (!unmodifiedChecks.some((c) => /Not implemented|NotImplementedError/.test(c.output)))
        throw new Error(`${task.id}: unmodified failure did not reach its workflow stub: ${JSON.stringify(unmodifiedChecks)}`);
      cpSync(path.join(root, 'reference', task.repo + (task.repo === 'dispatch-desk' ? '.py.txt' : '.ts.txt')), path.join(dir, task.target));
      const checks = acceptance(task, dir, root), reference = checks.every((c) => c.passed);
      if (!reference) throw new Error(`${task.id}: reference failed: ${JSON.stringify(checks.filter((c) => !c.passed))}`);
      for (const symbol of task.symbols) {
        const [file, name] = symbol.split('#') as [string, string];
        if (!readFileSync(path.join(dir, file), 'utf8').includes(name.split('.').at(-1)!)) throw new Error(`Ground truth symbol absent: ${symbol}`);
      }
      return { task: task.id, reference, unmodified };
    });
    return { referencePassed: rows.filter((r) => r.reference).length, unmodifiedFailed: rows.filter((r) => !r.unmodified).length, total: rows.length, rows };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

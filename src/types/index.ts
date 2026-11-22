import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import type { ChangedFile } from '../grounding/ranges.js';
import { estimateTokens } from '../util/tokens.js';

export interface TypeFinding {
  file: string; line: number; column: number; name: string; message: string;
  code: number | string; language: 'typescript' | 'python'; blocking: boolean; preExisting?: boolean;
}
export interface TypeCheckResult {
  available: { typescript: boolean | string; python: boolean | string };
  findings: TypeFinding[]; timedOut: boolean;
}
let child: ChildProcess | undefined;
let queue: Promise<unknown> = Promise.resolve();

function request(payload: object, timeoutMs: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  const run = () => new Promise((resolve, reject) => {
    if (Date.now() >= deadline) { reject(new Error('timeout')); return; }
    if (!child) {
      const compiled = new URL('../types/worker.js', import.meta.url);
      const source = new URL('../types/worker.ts', import.meta.url);
      const js = existsSync(fileURLToPath(compiled));
      child = fork(fileURLToPath(js ? compiled : source), [], { execArgv: js ? [] : ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      child.unref(); child.channel?.unref();
      const spawned = child;
      spawned.on('exit', () => { if (child === spawned) child = undefined; });
    }
    const current = child;
    const cleanup = () => { clearTimeout(timer); current.off('message', done); current.off('error', fail); current.off('exit', exited); current.unref(); current.channel?.unref(); };
    const done = (value: unknown) => { cleanup(); resolve(value); };
    const fail = (e: Error) => { cleanup(); if (child === current) child = undefined; reject(e); };
    const exited = () => fail(new Error('compiler worker exited'));
    const timer = setTimeout(() => { cleanup(); current.kill(); if (child === current) child = undefined; reject(new Error('timeout')); }, Math.max(1, deadline - Date.now()));
    current.ref(); current.channel?.ref();
    current.once('message', done); current.once('error', fail); current.once('exit', exited); current.send({ ...payload, deadline });
  });
  const result = queue.then(run, run); queue = result.catch(() => {}); return result;
}

export async function typeCheck(root: string, changed: ChangedFile[], config: GroundworkConfig, options: { timeoutMs?: number; base?: string } = {}): Promise<TypeCheckResult> {
  const safe = changed.map((f) => ({ ...f, file: path.relative(root, path.resolve(root, f.file)) })).filter((f) => f.file && !f.file.startsWith(`..${path.sep}`) && f.file !== '..' && !path.isAbsolute(f.file) && (f.ranges === null || f.ranges.length));
  if (!config.types.enabled || !safe.length) return { available: { typescript: false, python: false }, findings: [], timedOut: false };
  try {
    const result = await request({ root, changed: safe, config, base: options.base }, options.timeoutMs ?? config.types.timeoutMs) as TypeCheckResult & { unavailable?: string };
    if (!result.available) throw new Error(result.unavailable ?? 'compiler worker unavailable');
    return result;
  }
  catch (e) { const reason = (e as Error).message; return { available: { typescript: reason, python: reason }, findings: [], timedOut: reason === 'timeout' }; }
}

export async function typeNavigate(root: string, target: string, operation: 'def' | 'impl' | 'refs', timeoutMs: number) {
  try { return await request({ root, target, operation }, timeoutMs); } catch (e) { return { unavailable: (e as Error).message }; }
}

export function renderTypes(result: TypeCheckResult, budget: number, explicit = true): string {
  const lines = [...result.findings].sort((a, b) => Number(b.blocking) - Number(a.blocking)).map((f) => `${f.file}:${f.line}:${f.column} ${f.blocking ? 'error' : 'info'} ${f.code}: ${f.message}`);
  if (explicit) for (const [language, available] of Object.entries(result.available)) if (typeof available === 'string') lines.push(`types: unavailable (${language}: ${available})`);
  const kept: string[] = [];
  for (const line of lines) { if (estimateTokens([...kept, line].join('\n')) > budget) break; kept.push(line); }
  return kept.join('\n') || (lines.length && budget > 0 ? '…' : '');
}

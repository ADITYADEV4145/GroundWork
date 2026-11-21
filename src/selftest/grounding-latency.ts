import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshIndex } from '../index/refresh.js';
import { initSqlBackend } from '../store/db.js';
import { tempDir } from './fixtures.js';
import type { CheckResult } from './registry.js';
import { prng, synthRepo } from './synth.js';
import type { HookLatencyEdit, HookLatencySample } from './hook-latency-worker.js';

export function percentile(values: number[], fraction: number): number {
  if (!values.length || fraction <= 0 || fraction > 1) throw new Error('percentile requires samples and a fraction in (0, 1]');
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;
}

export function combineLatencyBatches(batches: CheckResult[]): CheckResult {
  const detail = batches.map((batch, i) => `batch ${i + 1}: ${batch.detail}`).join('\n');
  if (batches.length !== 3 || batches.some((batch) => batch.metrics?.samples !== 40 || batch.metrics.validatedSamples !== 40 ||
    !Number.isFinite(batch.metrics.p50Ms) || !Number.isFinite(batch.metrics.p95Ms)))
    return { ok: false, detail: `Incomplete PostToolUse batches; every sample must pass validation.\n${detail}` };
  const p50 = percentile(batches.map((batch) => batch.metrics!.p50Ms!), 0.5);
  const p95 = percentile(batches.map((batch) => batch.metrics!.p95Ms!), 0.5);
  return { ok: p95 < 200,
    detail: `built PostToolUse: median batch p50 ${p50.toFixed(2)} ms, median batch p95 ${p95.toFixed(2)} ms; fixed 3 independent batches of 40 fresh processes; all batches reported, no measured samples dropped, not best-of-N\n${detail}`,
    metrics: { p50Ms: p50, p95Ms: p95, samples: 120, batches: 3,
      ...Object.fromEntries(batches.map((batch, i) => [`batch${i + 1}P95Ms`, batch.metrics!.p95Ms!])) } };
}

export async function groundingHookLatency(): Promise<CheckResult> {
  const batches: CheckResult[] = [];
  for (let i = 0; i < 3; i++) batches.push(await groundingHookLatencyBatch(i));
  const result = combineLatencyBatches(batches);
  if (process.env.GW_HOOK_LATENCY_LOG) writeFileSync(process.env.GW_HOOK_LATENCY_LOG, JSON.stringify({ ...result, batchResults: batches }, null, 2) + '\n');
  return result;
}

async function groundingHookLatencyBatch(batch: number): Promise<CheckResult> {
  const main = fileURLToPath(new URL('../../dist/cli/main.js', import.meta.url));
  const worker = fileURLToPath(new URL('../../dist/selftest/hook-latency-worker.js', import.meta.url));
  if (!existsSync(main) || !existsSync(worker)) return { ok: false, detail: 'Run npm run build before the built PostToolUse latency check.' };
  await initSqlBackend();
  const dir = tempDir('gw-ground-perf-');
  try {
    synthRepo(dir, 100_000, 4 + batch);
    await refreshIndex(dir);
    const rnd = prng(11 + batch);
    const ts = readdirSync(path.join(dir, 'src')).filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`);
    const py = readdirSync(path.join(dir, 'py/pkg')).filter((f) => /^pmod.*\.py$/.test(f)).map((f) => `py/pkg/${f}`);
    const times: number[] = [];
    const stages: Record<string, number[]> = {};
    const session = randomUUID();
    const edits: HookLatencyEdit[] = [];
    const expected: { file: string; bad: boolean; write: boolean; fn: string }[] = [];
    for (let i = 0; i < 42; i++) {
      const python = i % 2 === 1;
      const files = python ? py : ts;
      const file = files.splice(Math.floor(rnd() * files.length), 1)[0]!;
      const absolute = path.join(dir, file);
      const before = readFileSync(absolute, 'utf8');
      const fn = python ? 'helper_1' : /export function (\w+)\(/.exec(before)![1]!;
      const bad = Math.floor(i / 4) % 2 === 1;
      const edit = python ? `\ndef gw_edit_${i}():\n    return ${fn}(${bad ? '' : '1'})\n`
        : `\nexport function gwEdit${i}(): string { return ${fn}(${bad ? '' : "'a'"}); }\n`;
      const content = before + edit;
      const anchor = before.split('\n').slice(-4).join('\n');
      const write = Math.floor(i / 2) % 2 === 1;
      const payload = { cwd: dir, session_id: session, hook_event_name: 'PostToolUse', tool_name: write ? 'Write' : 'Edit',
        tool_input: write ? { file_path: absolute, content } : { file_path: absolute, old_string: anchor, new_string: anchor + edit },
        tool_response: { filePath: absolute, success: true } };
      edits.push({ file: absolute, content, payload });
      expected.push({ file, bad, write, fn });
    }
    // Fork cost depends on the parent's RSS: keep prior selftests and indexing out of the timing host.
    const host = spawnSync(process.execPath, [worker], { cwd: dir, encoding: 'utf8', timeout: 120_000,
      input: JSON.stringify({ main, root: dir, edits }), maxBuffer: 8 * 1024 * 1024 });
    if (host.status !== 0) return { ok: false, detail: `PostToolUse timing host failed: ${host.error?.message ?? host.stderr}` };
    const samples = JSON.parse(host.stdout) as HookLatencySample[];
    if (process.env.GW_HOOK_LATENCY_LOG) writeFileSync(`${process.env.GW_HOOK_LATENCY_LOG}.batch-${batch + 1}.json`,
      JSON.stringify(samples.map((sample, i) => ({ ...expected[i], index: i, warmup: i < 2, ...sample })), null, 2) + '\n');
    if (samples.length !== edits.length) return { ok: false, detail: `PostToolUse timing host returned ${samples.length}/${edits.length} samples` };
    for (const [i, child] of samples.entries()) {
      const { file, bad, write, fn } = expected[i]!;
      let message = '';
      let timing: Record<string, number> | undefined;
      try {
        if (child.stdout.trim()) message = JSON.parse(child.stdout).hookSpecificOutput.additionalContext;
        timing = JSON.parse(child.stderr.trim().split('\n').at(-1)!).hookTimings;
      } catch { /* Invalid output is a failed sample, not a fast allow. */ }
      if (child.status !== 0 || !timing || !Number.isFinite(timing.refresh_on_edit) || !Number.isFinite(timing.grounding_on_edit)
        || timing.groundingFiles !== 1 || timing.groundingUnchecked !== 0 || timing.groundingFindings !== Number(bad) || typeof message !== 'string'
        || (bad ? !message.includes(`${file}:`) || !message.includes('arity') || !message.includes(fn) : !!child.stdout.trim()))
        return { ok: false, detail: `PostToolUse sample ${i} (${file}, ${write ? 'Write' : 'Edit'}, ${bad ? 'arity' : 'clean'}) failed: ${child.error ?? child.stderr}; ${child.stdout}` };
      if (i < 2) continue;
      times.push(child.elapsed);
      for (const [name, ms] of Object.entries(timing)) (stages[name] ??= []).push(ms);
    }
    const p50 = percentile(times, 0.5), p95 = percentile(times, 0.95);
    const stage = (name: string) => percentile(stages[name]!, 0.5);
    return { ok: p95 < 200,
      detail: `built PostToolUse: p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms over 40 fresh processes (20 TS/20 Python, Edit/Write, clean/arity; 2 warmups excluded); lightweight timing host, warm index/compile cache, startup included; in-process p50 refresh ${stage('refresh_on_edit').toFixed(2)} ms + grounding ${stage('grounding_on_edit').toFixed(2)} ms; startup ${stage('startupMs').toFixed(2)}, bundle ${stage('bundleMs').toFixed(2)}, sqlite open ${stage('indexOpenMs').toFixed(2)}, parser ${stage('parserInitMs').toFixed(2)}, link ${stage('linkMs').toFixed(2)}, verify ${stage('verifyMs').toFixed(2)}, render ${stage('renderMs').toFixed(2)} ms; every sample checked`,
      metrics: { p50Ms: p50, p95Ms: p95, samples: times.length, validatedSamples: times.length, ...Object.fromEntries(Object.keys(stages).map((name) => [`${name}P50`, stage(name)])) } };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hookTiming, printHookTimings } from '../src/util/hook-timing.js';
import { combineLatencyBatches, percentile } from '../src/selftest/grounding-latency.js';
import { sampleBuiltHooks } from '../src/selftest/hook-latency-worker.js';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('hook timing', () => {
  it('measures fresh commands with stdin and records failures without hiding them', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gw-hook-host-test-'));
    try {
      const main = path.join(root, 'hook.cjs'), file = path.join(root, 'edited.ts');
      writeFileSync(main, 'process.stdout.write(require("node:fs").readFileSync(0, "utf8"));');
      const edits = [{ file, content: 'updated', payload: { tool_name: 'Edit' } }];
      const [sample] = sampleBuiltHooks(main, root, edits);
      expect(sample?.status).toBe(0);
      expect(sample?.elapsed).toBeGreaterThan(0);
      expect(sample?.stdout).toBe(JSON.stringify(edits[0]!.payload));
      expect(readFileSync(file, 'utf8')).toBe('updated');
      expect(sampleBuiltHooks(main, root, [])).toEqual([]);
      const [failed] = sampleBuiltHooks(path.join(root, 'missing.cjs'), root, edits);
      expect(failed?.status).not.toBe(0);
      expect(failed?.stderr).toContain('MODULE_NOT_FOUND');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('uses nearest-rank p95 without mutating the samples', () => {
    const values = Array.from({ length: 40 }, (_, i) => 40 - i);
    expect(percentile(values, 0.95)).toBe(38);
    expect(percentile(values, 0.5)).toBe(20);
    expect(values[0]).toBe(40);
    expect(() => percentile([], 0.95)).toThrow();
    expect(() => percentile([1], 0)).toThrow();
  });
  it('gates the median of three complete batches, retaining slow batches and rejecting invalid samples', () => {
    const batch = (p95Ms: number) => ({ ok: p95Ms < 200, detail: `p95 ${p95Ms}`, metrics: { p50Ms: 80, p95Ms, samples: 40, validatedSamples: 40 } });
    const result = combineLatencyBatches([batch(120), batch(130), batch(350)]);
    expect(result.ok).toBe(true);
    expect(result.metrics).toMatchObject({ p95Ms: 130, samples: 120, batch3P95Ms: 350 });
    expect(result.detail).toContain('batch 3: p95 350');
    expect(combineLatencyBatches([batch(100), batch(220), batch(230)]).ok).toBe(false);
    expect(combineLatencyBatches([batch(100), batch(200), batch(210)]).ok).toBe(false);
    expect(combineLatencyBatches([]).ok).toBe(false);
    expect(combineLatencyBatches([batch(100)]).ok).toBe(false);
    expect(combineLatencyBatches([batch(100), batch(110), { ok: false, detail: 'grounding did not run' }]).ok).toBe(false);
    expect(combineLatencyBatches([batch(100), batch(110), { ...batch(120), metrics: { p50Ms: 80, p95Ms: NaN, samples: 40, validatedSamples: 40 } }]).ok).toBe(false);
  });
  it('is silent by default and writes opt-in diagnostics only to stderr', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.stubEnv('GW_HOOK_TIMINGS', '0');
    hookTiming('ignored', 10);
    printHookTimings();
    expect(stderr).not.toHaveBeenCalled();
    vi.stubEnv('GW_HOOK_TIMINGS', '1');
    hookTiming('refresh', 2);
    hookTiming('refresh', 3);
    vi.spyOn(process, 'resourceUsage').mockReturnValue({ ...process.resourceUsage(), userCPUTime: 1200, systemCPUTime: 300 });
    vi.spyOn(process, 'uptime').mockReturnValue(0.1);
    printHookTimings();
    expect(JSON.parse(String(stderr.mock.calls[0]![0]))).toEqual({ hookTimings: { refresh: 5, cpuUserMs: 1.2, cpuSystemMs: 0.3, uptimeMs: 100 } });
    expect(stdout).not.toHaveBeenCalled();
  });
});

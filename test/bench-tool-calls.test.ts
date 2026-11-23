import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { collect, differenceInterval, render, summarize, SUITES } from '../scripts/bench-tool-calls.mjs';

const sample = (task: string, toolCalls: number, success = true) => ({ task, toolCalls, success });
const capture = (condition: string, run: number, calls: number[]) => ({ condition, run, protocol: 'stable-v1', samples: calls.map((n, i) => sample(`t${i}`, n)) });

describe('tool calls per task', () => {
  it('divides captured calls by attempts and pairs the arms', () => {
    const evidence = { captures: [capture('baseline', 1, [2, 4]), capture('baseline', 2, [2, 4]), capture('groundwork', 1, [1, 3]), capture('groundwork', 2, [1, 3])] };
    const s = summarize(evidence, ['t0', 't1']);
    expect(s.baseline).toEqual({ sessions: 2, attempts: 4, success: 4, toolCalls: 12, toolCallsPerTask: 3 });
    expect(s.groundwork.toolCallsPerTask).toBe(2);
    expect(s.difference).toEqual({ mean: -1, low: -1, high: -1 });
    expect(s.taskDifferences).toEqual([{ task: 't0', baseline: 2, groundwork: 1 }, { task: 't1', baseline: 4, groundwork: 3 }]);
    expect(s.protocol).toBe('stable-v1');
  });

  it('rejects incomplete, duplicate, unpaired and invalid evidence', () => {
    const b = capture('baseline', 1, [1, 1]), g = capture('groundwork', 1, [1, 1]);
    expect(() => summarize({ captures: [b] }, ['t0', 't1'])).toThrow(/Missing groundwork/);
    expect(() => summarize({ captures: [b, g] }, ['t0', 't1', 't2'])).toThrow(/Incomplete/);
    expect(() => summarize({ captures: [b, b, g] }, ['t0', 't1'])).toThrow(/Duplicate/);
    expect(() => summarize({ captures: [b, capture('baseline', 2, [1, 1]), g] }, ['t0', 't1'])).toThrow(/Unpaired/);
    expect(() => summarize({ captures: [b, capture('groundwork', 1, [1, -1])] }, ['t0', 't1'])).toThrow(/Invalid tool-call/);
    expect(() => differenceInterval([], [1])).toThrow(/nonempty/);
  });

  it('keeps the published table in step with the recorded evidence', () => {
    const rows = collect();
    for (const suite of SUITES) expect(rows.some((r: { suite: string }) => r.suite === suite)).toBe(true);
    expect(render(rows)).toBe(readFileSync(new URL('../bench/TOOL-CALLS.md', import.meta.url), 'utf8'));
    expect({ version: 1, runs: rows }).toEqual(JSON.parse(readFileSync(new URL('../bench/tool-calls.json', import.meta.url), 'utf8')));
    // Totals must agree with the frozen per-run reports.
    for (const r of rows) {
      const md = readFileSync(new URL(`../${r.evidence.replace('.evidence.json', '.md')}`, import.meta.url), 'utf8');
      expect(md).toContain(`| Captured tool calls | ${r.baseline.toolCalls} | ${r.groundwork.toolCalls} |`);
    }
  });
});

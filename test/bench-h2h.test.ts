import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error JavaScript benchmark entry point
import { analyze, arms } from '../scripts/bench-h2h.mjs';

test('competitor stdio arms record normal, empty and error responses; baseline rejects MCP', () => {
  const parent = mkdtempSync(path.join(os.homedir(), 'h2h-test-'));
  try {
    const config = path.join(parent, 'arms.json');
    const launch = { command: process.execPath, args: [path.resolve('test/fixtures/h2h-server.mjs')] };
    writeFileSync(config, JSON.stringify({ serena: launch, 'codebase-memory': launch }));
    const revision = JSON.parse(readFileSync('bench/nav/tasks.json', 'utf8')).revision;
    for (const arm of ['serena', 'codebase-memory', 'baseline']) {
      const state = path.join(parent, arm);
      const run = (...args: string[]) => spawnSync(process.execPath, ['bench/capture.mjs', ...args], { encoding: 'utf8', env: { ...process.env, GW_BENCH_PROTOCOL: '', GW_BENCH_SUITE: 'nav', GW_BENCH_ARMS_CONFIG: config } });
      expect(run('init', state, arm, '1').status).toBe(0);
      mkdirSync(path.join(state, 'ts-01'));
      writeFileSync(path.join(state, 'ts-01.json'), JSON.stringify({ task: 'ts-01', startedAt: Date.now(), tools: [] }));
      expect(JSON.parse(readFileSync(path.join(state, 'metadata.json'), 'utf8')).revision).toBe(revision);
      for (const tool of ['echo', 'empty', 'fail', 'unknown']) {
        const result = run('mcp', state, 'ts-01', tool);
        expect(result.status, result.stderr).toBe(0);
        if (arm === 'baseline') expect(result.stdout).toBe('Error: MCP is unavailable in the baseline arm\n');
        else if (tool === 'echo') expect(result.stdout).toBe('hello\n');
        else if (tool === 'empty') expect(result.stdout).toBe('');
        else expect(result.stdout.length).toBeGreaterThan(0);
        const recorded = JSON.parse(readFileSync(path.join(state, 'ts-01.json'), 'utf8')).tools.at(-1);
        expect(recorded.bytes).toBe(Buffer.byteLength(result.stdout));
        expect(recorded.durationMs).toBeGreaterThanOrEqual(0);
        expect(recorded.endedAt).toBeGreaterThanOrEqual(recorded.startedAt);
      }
    }
  } finally { rmSync(parent, { recursive: true, force: true }); }
}, 60_000);

const revision = 'a'.repeat(40);
const suites = ['nav', 'long-horizon'].map((name) => ({ name, suite: { revision, tasks: [{ id: 'one', category: 'lookup', repo: 'fixture' }] }, grader: () => true }));
function captures() {
  return suites.flatMap(({ name }) => arms.flatMap((condition: string) => Array.from({ length: 16 }, (_, i) => ({
    suite: name, revision, captureRevision: revision, condition, run: i + 1, agent: 'test', model: null, node: process.version,
    protocol: 'stable-v1', sessionStartBasis: 'workspace-ready', sessionStartedAt: 0, sessionEndedAt: condition === 'groundwork' ? 50 : 100,
    observations: [{ task: 'one', startedAt: 1, endedAt: 2, wallMs: 1, tools: [] }],
  }))));
}
test('synthetic complete exports produce all ten registered comparisons with guardrails', async () => {
  const report = await analyze(captures(), suites, revision);
  expect(report.comparisons).toHaveLength(10);
  expect(report.comparisons[0].metrics.elapsedMsPerTask.reductionPct.adjustedLow).toBe(50);
  expect(report.comparisons[0].confirmatoryWin).toBe(true);
  expect(report.comparisons[0].metrics.emittedBytesPerSession.reductionPct).toBeNull();
});
test('rejects incomplete arms, mixed revisions and non-stable timing', async () => {
  await expect(analyze(captures().slice(1), suites, revision)).rejects.toThrow('Incomplete arm');
  const mixed = captures(); mixed[0]!.captureRevision = 'b'.repeat(40);
  await expect(analyze(mixed, suites, revision)).rejects.toThrow('Mixed captureRevision');
  const legacy = captures(); legacy[0]!.sessionStartBasis = 'first-captured-action';
  await expect(analyze(legacy, suites, revision)).rejects.toThrow('Non-stable');
  const missing = captures(); delete (missing[0]!.observations[0] as { endedAt?: number }).endedAt;
  await expect(analyze(missing, suites, revision)).rejects.toThrow();
});

test.each(['agent', 'model', 'node'] as const)('rejects mixed %s across suites', async (field) => {
  const mixed = captures();
  Object.assign(mixed.at(-1)!, { [field]: 'different' });
  await expect(analyze(mixed, suites, revision)).rejects.toThrow('same agent, model and Node');
});

test('requires the shared capture revision to match the grader checkout HEAD', async () => {
  await expect(analyze(captures(), suites, 'b'.repeat(40))).rejects.toThrow('match grader checkout HEAD');
  await expect(analyze(captures(), suites)).rejects.toThrow('match grader checkout HEAD');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const matching = captures().map((c) => ({ ...c, captureRevision: head }));
  expect((await analyze(matching, suites)).comparisons).toHaveLength(10);
});

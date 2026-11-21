import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptance } from '../src/bench/grounding/acceptance.js';
import { tasks } from '../src/bench/grounding/tasks.js';

vi.mock('node:child_process', async (original) => ({ ...await original<typeof import('node:child_process')>(), spawnSync: vi.fn() }));
const spawn = vi.mocked(spawnSync);
afterEach(() => spawn.mockReset());
const task = tasks().find((t) => t.id === 'dispatch-cancelled')!;
const result = (extra = {}) => ({ pid: 1, status: 0, signal: null, output: [], stdout: '', stderr: '', ...extra });

describe('grounding acceptance subprocesses', () => {
  it('records a timed-out workflow as a failed scenario and continues checking', () => {
    const error = Object.assign(new Error('spawnSync python3 ETIMEDOUT'), { code: 'ETIMEDOUT' });
    spawn.mockReturnValue(result()).mockReturnValueOnce(result({ error, status: null, signal: 'SIGTERM', stdout: 'partial output' }));
    const checks = acceptance(task, '/workspace');
    expect(checks).toHaveLength(4);
    expect(checks[0]).toMatchObject({ id: 'scenario-1', passed: false, output: expect.stringMatching(/partial output.*timed out/s) });
    expect(checks.slice(1).every((c) => c.passed)).toBe(true);
  });
  it('preserves unsuccessful process output and successful empty results', () => {
    spawn.mockReturnValue(result()).mockReturnValueOnce(result({ status: 1, stdout: 'out', stderr: 'err' }));
    expect(acceptance(task, '/workspace')).toEqual([
      { id: 'scenario-1', passed: false, output: 'outerr' },
      ...[2, 3, 4].map((n) => ({ id: `scenario-${n}`, passed: true, output: '' })),
    ]);
  });
  it('still throws for infrastructure errors rather than scoring a missing interpreter', () => {
    spawn.mockReturnValue(result({ error: Object.assign(new Error('missing executable'), { code: 'ENOENT' }), status: null }));
    expect(() => acceptance(task, '/workspace')).toThrow('Acceptance infrastructure failed: missing executable');
  });
});

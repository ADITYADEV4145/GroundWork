import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../src/cli/commands/selftest.js';
import { runSelftest } from '../src/selftest/run.js';

vi.mock('../src/selftest/run.js', () => ({ runSelftest: vi.fn() }));

beforeEach(() => {
  vi.stubEnv('GW_SELFTEST_INSTALL', undefined);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.mocked(runSelftest).mockResolvedValue({ through: 5, ok: true, results: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function invoke(...args: string[]) {
  const program = new Command();
  register(program);
  await program.parseAsync(['selftest', '--through', '5', ...args], { from: 'user' });
}

describe('selftest install consent flag', () => {
  it('opts in before dispatching the checks without shell-specific environment syntax', async () => {
    vi.mocked(runSelftest).mockImplementation(async () => {
      expect(process.env.GW_SELFTEST_INSTALL).toBe('1');
      return { through: 5, ok: true, results: [] };
    });
    await invoke('--install-check');
    expect(runSelftest).toHaveBeenCalled();
  });

  it.each([undefined, '0', '1'])('preserves environment consent without the flag (%s)', async (value) => {
    vi.stubEnv('GW_SELFTEST_INSTALL', value);
    await invoke();
    expect(process.env.GW_SELFTEST_INSTALL).toBe(value);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { packagingChecks } from '../src/selftest/checks/phase5-packaging.js';

afterEach(() => vi.unstubAllEnvs());

describe('packed install selftest consent', () => {
  it.each([undefined, '0', 'false'])('skips network installation without explicit opt-in (%s)', async (value) => {
    vi.stubEnv('GW_SELFTEST_INSTALL', value);
    const check = packagingChecks.find((c) => c.name.startsWith('packed fresh-prefix'))!;
    const result = await check.run({ quick: false, sequences: 1 });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.detail).toContain('requires network');
    expect(result.detail).toContain('GW_SELFTEST_INSTALL=1');
  });
});

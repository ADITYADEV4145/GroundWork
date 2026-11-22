import { afterEach, expect, it, vi } from 'vitest';
import { defaultConfig } from '../src/config/load.js';
import { configSchema } from '../src/config/schema.js';
import { experimentalReadPathsEnabled } from '../src/config/sections/navigation.js';

afterEach(() => vi.unstubAllEnvs());

it('defaults read-path experiments off, supports root config and explicit fail-closed env overrides', () => {
  vi.stubEnv('GW_EXPERIMENTAL_READ_PATHS', undefined);
  const defaults = defaultConfig();
  const enabled = configSchema.parse({ navigation: { experimentalReadPaths: true } });
  expect(defaults.navigation.experimentalReadPaths).toBe(false);
  expect(experimentalReadPathsEnabled(defaults)).toBe(false);
  expect(experimentalReadPathsEnabled(enabled)).toBe(true);
  vi.stubEnv('GW_EXPERIMENTAL_READ_PATHS', '1');
  expect(experimentalReadPathsEnabled(defaults)).toBe(true);
  for (const value of ['0', '', 'true', 'invalid']) {
    vi.stubEnv('GW_EXPERIMENTAL_READ_PATHS', value);
    expect(experimentalReadPathsEnabled(enabled)).toBe(false);
  }
  expect(() => configSchema.parse({ navigation: { experimentalReadPaths: 'true' } })).toThrow();
});

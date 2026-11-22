import { rmSync } from 'node:fs';
import { expect, it } from 'vitest';
import { tempDir } from '../src/selftest/fixtures.js';
import { scenarioGit, writeScenarioFile } from '../src/reuse/scenarios.js';
import { checkRepository } from '../src/reuse/check.js';
import { defaultConfig } from '../src/config/load.js';

const cases = [
  ['ts', 'export const RETRY_LIMIT = 42;', 'export const retryLimit = 42;'],
  ['py', 'RETRY_LIMIT = 42', 'retry_limit = 42'],
  ['go', 'package app\nconst RETRY_LIMIT = 42', 'package app\nvar retryLimit = 42'],
  ['rs', 'const RETRY_LIMIT: i32 = 42;', 'fn run() -> i32 { let retry_limit = 42; let delay = retry_limit + 1; delay * 2 + retry_limit }'],
  ['java', 'class Original { static final int RETRY_LIMIT = 42; }', 'class Draft { int run() { int retryLimit = 42; int delay = retryLimit + 1; return delay * 2 + retryLimit; } }'],
  ['cs', 'class Original { const int RETRY_LIMIT = 42; }', 'class Draft { int Run() { int retryLimit = 42; int delay = retryLimit + 1; return delay * 2 + retryLimit; } }'],
  ['rb', 'RETRY_LIMIT = 42', 'retry_limit = 42'],
] as const;
it.each(cases)('detects copied %s numeric constants in config assignments', async (extension, original, draft) => {
  const root = tempDir('gw-numeric-parity-');
  try {
    writeScenarioFile(root, '.gitignore', '.groundwork/\n');
    writeScenarioFile(root, `original.${extension}`, original);
    scenarioGit(root, 'init', '-q');
    scenarioGit(root, 'add', '.gitignore', `original.${extension}`);
    scenarioGit(root, 'commit', '-qm', 'numeric baseline');
    writeScenarioFile(root, `draft.${extension}`, draft);
    const config = defaultConfig(); config.reuse.embeddings.enabled = false;
    const result = await checkRepository(root, { config });
    expect(result.findings.filter((f) => f.kind === 'duplicate-constant').map((f) => f.existing?.symbol)).toContain('RETRY_LIMIT');
    writeScenarioFile(root, `draft.${extension}`, draft.replaceAll('retryLimit', 'value').replaceAll('retry_limit', 'value'));
    expect((await checkRepository(root, { config })).findings.some((f) => f.kind === 'duplicate-constant')).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { rmSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { adapterFor, initParsers } from '../src/lang/index.js';
import { inspectSource } from '../src/reuse/inspection.js';
import { tempDir } from '../src/selftest/fixtures.js';
import { scenarioGit, writeScenarioFile } from '../src/reuse/scenarios.js';
import { checkRepository } from '../src/reuse/check.js';
import { defaultConfig } from '../src/config/load.js';
import type { Language } from '../src/types.js';

beforeAll(initParsers);
const cases: [Language, string][] = [
  ['go', 'package app\nvar retryLimit, value = 5, 42'],
  ['go', 'package app\nfunc run() { retryLimit, value := 5, 42 }'],
  ['go', 'package app\nconst retryLimit, value = 5, 42'],
  ['rust', 'fn run() { let (retryLimit, value) = (5, 42); }'],
  ['ruby', 'retryLimit, value = 5, 42'],
  ['java', 'class App { int retryLimit = 5, value = 42; }'],
  ['csharp', 'class App { int retryLimit = 5, value = 42; }'],
];
it.each(cases)('pairs %s multi-assignment literals by position: %s', (language, source) => {
  const literals = inspectSource(source, language).literals;
  expect(literals.map((l) => [l.value, l.configish])).toEqual([['5', true], ['42', false]]);
  expect(inspectSource(source.replace('retryLimit, value', 'value, retryLimit').replace('retryLimit = 5, value', 'value = 5, retryLimit'), language).literals.map((l) => l.configish)).toEqual([false, true]);
});

it.each<Language>(['go', 'rust', 'ruby'])('uses no label for mismatched %s assignment counts', (language) => {
  const source = language === 'go' ? 'package app\nvar retryLimit, value = 5, 42, 7' : language === 'rust' ? 'fn run() { let (retryLimit, value) = (5, 42, 7); }' : 'retryLimit, value = 5, 42, 7';
  expect(inspectSource(source, language).literals.map((l) => l.configish)).toEqual([false, false, false]);
});

it('pairs Go constant owners and refuses mismatched counts', () => {
  const extract = (source: string) => adapterFor('go').extract('package app\n' + source, 'go').literals;
  expect(extract('const retryLimit, value = 5, 42').map((l) => [l.value, l.constName])).toEqual([['5', 'retryLimit'], ['42', 'value']]);
  expect(extract('const retryLimit, value = 5, 42, 7').some((l) => l.constName !== null)).toBe(false);
  expect(adapterFor('go').extract('package app\nconst retryLimit, value = 5, 42', 'go').symbols.map((s) => s.name)).toEqual(['retryLimit', 'value']);
});

it('does not block an unrelated Go value in a multi-name config assignment', async () => {
  const root = tempDir('gw-multi-assignment-');
  try {
    writeScenarioFile(root, '.gitignore', '.groundwork/\n');
    writeScenarioFile(root, 'original.go', 'package app\nconst RETRY_LIMIT = 42');
    scenarioGit(root, 'init', '-q');
    scenarioGit(root, 'add', '.gitignore', 'original.go');
    scenarioGit(root, 'commit', '-qm', 'baseline');
    writeScenarioFile(root, 'draft.go', 'package app\nvar retryLimit, value = 5, 42');
    const config = defaultConfig(); config.reuse.embeddings.enabled = false;
    expect((await checkRepository(root, { config })).findings.filter((f) => f.kind === 'duplicate-constant')).toEqual([]);
    writeScenarioFile(root, 'draft.go', 'package app\nvar value, retryLimit = 5, 42');
    expect((await checkRepository(root, { config })).findings.some((f) => f.kind === 'duplicate-constant')).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

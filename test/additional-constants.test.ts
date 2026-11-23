import { beforeAll, expect, it } from 'vitest';
import { adapterFor, initParsers } from '../src/lang/index.js';
import type { Language } from '../src/types.js';
import { rmSync } from 'node:fs';
import { tempDir } from '../src/selftest/fixtures.js';
import { scenarioGit, writeScenarioFile } from '../src/reuse/scenarios.js';
import { checkRepository } from '../src/reuse/check.js';
import { defaultConfig } from '../src/config/load.js';

beforeAll(initParsers);
const cases: [Language, string][] = [
  ['go', 'package app\nconst ENDPOINT = "https://example.org/api"\n'],
  ['rust', 'const ENDPOINT: &str = "https://example.org/api";'],
  ['ruby', 'ENDPOINT = "https://example.org/api"'],
  ['java', 'class App { static final String ENDPOINT = "https://example.org/api"; }'],
  ['csharp', 'class App { const string ENDPOINT = "https://example.org/api"; }'],
];
it.each(cases)('associates %s constant literals with their declaration', (language, source) => {
  const result = adapterFor(language).extract(source, language);
  const literal = result.literals.find((l) => l.value === 'https://example.org/api');
  expect(literal?.constName).toBe('ENDPOINT');
  expect(result.symbols[literal!.symbol!]?.name).toBe('ENDPOINT');
  const plain = adapterFor(language).extract(source.replace('https://example.org/api', 'plain value'), language);
  expect(plain.literals).toEqual(expect.arrayContaining([expect.objectContaining({ constName: 'ENDPOINT', value: 'plain value', kind: 'string' })]));
  const numeric = source.replace('"https://example.org/api"', '42').replace('&str', 'i32').replace('String', 'int').replace('string', 'int');
  expect(adapterFor(language).extract(numeric, language).literals).toEqual(expect.arrayContaining([expect.objectContaining({ constName: 'ENDPOINT', value: '42', kind: 'number' })]));
  expect(adapterFor(language).extract('', language).literals).toEqual([]);
});

it.each(cases)('flags copies of existing %s constants', async (language, source) => {
  const root = tempDir('gw-constant-target-');
  const extension = { go: 'go', rust: 'rs', ruby: 'rb', java: 'java', csharp: 'cs' }[language as 'go' | 'rust' | 'ruby' | 'java' | 'csharp'];
  try {
    writeScenarioFile(root, '.gitignore', '.groundwork/\n');
    writeScenarioFile(root, `original.${extension}`, source);
    scenarioGit(root, 'init', '-q');
    scenarioGit(root, 'add', '.gitignore', `original.${extension}`);
    scenarioGit(root, 'commit', '-qm', 'baseline constant');
    writeScenarioFile(root, `draft.${extension}`, source.replaceAll('ENDPOINT', 'DRAFT_ENDPOINT').replace('class App', 'class Draft'));
    const config = defaultConfig(); config.reuse.embeddings.enabled = false;
    const report = await checkRepository(root, { config });
    expect(report.findings.filter((f) => f.kind === 'duplicate-constant').map((f) => f.existing?.symbol)).toContain('ENDPOINT');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

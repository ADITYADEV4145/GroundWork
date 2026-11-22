import { beforeAll, expect, it } from 'vitest';
import { adapterFor, initParsers } from '../src/lang/index.js';
import type { Language } from '../src/types.js';

beforeAll(initParsers);
const cases: [Language, string][] = [
  ['go', 'package app\nfunc run() { const ENDPOINT = "https://example.org/api" }'],
  ['rust', 'fn run() { const ENDPOINT: &str = "https://example.org/api"; }'],
  ['ruby', 'def run\n ENDPOINT = "https://example.org/api"\nend'],
  ['java', 'class App { void run() { final String ENDPOINT = "https://example.org/api"; } }'],
  ['csharp', 'class App { void Run() { const string ENDPOINT = "https://example.org/api"; } }'],
];
it.each(cases)('does not expose function-local %s constants as reuse targets', (language, source) => {
  const result = adapterFor(language).extract(source, language);
  expect(result.literals.find((l) => l.value === 'https://example.org/api')?.constName).toBeNull();
});

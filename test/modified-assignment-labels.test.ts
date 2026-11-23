import { beforeAll, expect, it } from 'vitest';
import { initParsers } from '../src/lang/index.js';
import { inspectSource } from '../src/reuse/inspection.js';
import type { Language } from '../src/types.js';

beforeAll(initParsers);
const cases: [Language, string, string][] = [
  ['rust', 'let (mut retry_limit, value) = (42, 5);', 'let mut retry_limit = 42;'],
  ['rust', 'let (ref retry_limit, value) = (42, 5);', 'let ref retry_limit = 42;'],
  ['rust', 'let (ref mut retry_limit, value) = (42, 5);', 'let ref mut retry_limit = 42;'],
  ['ruby', '@retry_limit, value = 42, 5', '@retry_limit = 42'],
  ['ruby', '@@retry_limit, value = 42, 5', '@@retry_limit = 42'],
  ['ruby', '$retry_limit, value = 42, 5', '$retry_limit = 42'],
];
it.each(cases)('labels modified %s bindings like single assignments: %s', (language, multiple, single) => {
  const wrap = (source: string) => language === 'rust' ? `fn run() { ${source} }` : source;
  const expected = inspectSource(wrap(single), language).literals[0]!.configish;
  expect(expected).toBe(true);
  expect(inspectSource(wrap(multiple), language).literals.map((l) => l.configish)).toEqual([expected, false]);
});

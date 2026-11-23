import { beforeAll, expect, it } from 'vitest';
import { initParsers } from '../src/lang/index.js';
import { inspectSource } from '../src/reuse/inspection.js';

beforeAll(initParsers);
it.each([
  '(retry_limit, value) = (42, 5)',
  'retry_limit, value = 42, 5',
  '[retry_limit, value] = [42, 5]',
])('preserves origin/main Python inspection results: %s', (source) => {
  const expected = ['42', '5'].map((value) => ({
    start: source.lastIndexOf(value), end: source.lastIndexOf(value) + value.length,
    line: 1, value, kind: 'number', configish: true,
  }));
  expect(inspectSource(source, 'python').literals).toEqual(expected);
});

import { beforeAll, expect, it } from 'vitest';
import { initParsers } from '../src/lang/index.js';
import { inspectSource } from '../src/reuse/inspection.js';
import type { Language } from '../src/types.js';

beforeAll(initParsers);
it.each<Language>(['go', 'rust', 'java', 'csharp', 'ruby'])('reads exemption comments in %s', (language) => {
  const text = 'groundwork: allow-duplicate preserves isolated legacy runtime compatibility';
  const source = language === 'ruby' ? `# ${text}\n` : `// ${text}\n/* ${text} */\n`;
  expect(inspectSource(source, language).comments.map((c) => c.text)).toHaveLength(language === 'ruby' ? 1 : 2);
  expect(inspectSource(language === 'ruby' ? '"not a comment"' : '"not a comment";', language).comments).toEqual([]);
});

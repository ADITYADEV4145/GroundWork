import { expect, it, vi } from 'vitest';
import { findSimilar } from '../src/reuse/similar.js';
import type { CandidateIndex } from '../src/reuse/candidates.js';

it.each(['java', 'csharp'] as const)('uses the callable in a wrapped %s code draft', async (language) => {
  const find = vi.fn((_query: unknown) => []);
  const index = { embedQuery: async () => undefined, find } as unknown as CandidateIndex;
  await findSimilar(index, { language, description: 'normalize a name', code: 'class Draft { public string Normalize(string name) { return name.Trim().ToLower(); } }'.replaceAll('string', language === 'java' ? 'String' : 'string') });
  expect(find.mock.calls[0]?.[0]).toMatchObject({ name: 'Normalize', fingerprint: expect.any(Object) });
});

import { describe, expect, it } from 'vitest';
import { diffSnapshots, expectedSnapshot, FIXTURES, goldenSnapshot, withIndexedFixture } from '../src/selftest/fixtures.js';
import { indexStats } from '../src/index/query.js';

describe('extraction golden fixtures', () => {
  for (const name of FIXTURES) {
    it(`${name} matches expected.json (run \`npm run golden\` after intended changes)`, async () => {
      const diff = await withIndexedFixture(name, (db) => diffSnapshots(expectedSnapshot(name), goldenSnapshot(db)));
      expect(diff).toEqual([]);
    });
  }

  it('resolves >= 95% of internal imports', async () => {
    let internal = 0;
    let resolved = 0;
    for (const name of FIXTURES)
      await withIndexedFixture(name, (db) => {
        const s = indexStats(db);
        internal += s.importsInternal;
        resolved += s.importsResolved;
      });
    expect(resolved / internal).toBeGreaterThanOrEqual(0.95);
  });
});

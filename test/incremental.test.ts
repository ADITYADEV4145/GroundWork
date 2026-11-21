import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { incrementalMatchesFull } from '../src/selftest/incremental.js';
import { EDIT_OPS } from '../src/selftest/synth.js';

describe('incremental refresh', () => {
  it('equals a full rebuild for 200 random edit sequences', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1_000_000 }), fc.array(fc.constantFrom(...EDIT_OPS), { minLength: 1, maxLength: 4 }), async (seed, ops) => {
        expect(await incrementalMatchesFull(seed, ops, 150)).toBeNull();
      }),
      { numRuns: 200 },
    );
  }, 600_000);
});

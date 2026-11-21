import * as z from 'zod';

// Phase 1 (index). Owner: index stream.
export const indexConfigSchema = z
  .object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
    maxFileBytes: z.number().int().positive().default(1_000_000),
    skipGenerated: z.boolean().default(true),
    testGlobs: z
      .array(z.string())
      .default(['**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/test/**', '**/tests/**', '**/testing/**', '**/spec/**', '**/specs/**', '**/test_*.py', '**/*_test.py', '**/conftest.py']),
  })
  .strict();

import * as z from 'zod';

// Phase 2 (navigation + read guard). Owner: navigation stream.
export const navigationConfigSchema = z
  .object({
    readGuard: z
      .object({
        enabled: z.boolean().default(true),
        largeFileLines: z.number().int().positive().default(400),
      })
      .strict()
      .default({ enabled: true, largeFileLines: 400 }),
  })
  .strict();

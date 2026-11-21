import { z } from 'zod';

// Phase 3 (reuse first + duplicate gate). Owner: reuse stream.
export const reuseConfigSchema = z
  .object({
    duplicateGate: z.boolean().default(true),
    skipTests: z.boolean().default(true),
    embeddings: z.object({ enabled: z.boolean().default(false), model: z.string().optional() }).strict().default({ enabled: false }),
  })
  .strict();

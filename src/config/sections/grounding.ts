import { z } from 'zod';

// Phase 4 (grounding). Owner: grounding stream.
export const groundingConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
  })
  .strict();

import * as z from 'zod';

export const impactConfigSchema = z.object({
  enabled: z.boolean().default(true),
  stopGate: z.boolean().default(true),
  depth: z.number().int().min(1).max(5).default(2),
  budgetTokens: z.number().int().min(80).default(400),
  timeoutMs: z.number().int().positive().default(1500),
}).strict();

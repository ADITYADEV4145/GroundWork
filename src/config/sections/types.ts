import * as z from 'zod';

export const typesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  stopGate: z.boolean().default(true),
  postToolHook: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(4000),
  budgetTokens: z.number().int().positive().default(400),
  typescript: z.enum(['auto', 'off']).default('auto'),
  python: z.enum(['auto', 'off']).default('auto'),
}).strict();

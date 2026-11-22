import * as z from 'zod';

export const similarInputSchema = z.object({
  description: z.string().trim().min(1).max(10000),
  name: z.string().max(300).optional(),
  signature: z.string().max(10000).optional(),
  code: z.string().max(100000).optional(),
  language: z.enum(['typescript', 'tsx', 'javascript', 'python']).default('typescript'),
}).strict();
export type SimilarInput = z.input<typeof similarInputSchema>;

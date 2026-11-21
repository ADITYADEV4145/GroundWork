import type { z } from 'zod';

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `  - ${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`).join('\n');
}

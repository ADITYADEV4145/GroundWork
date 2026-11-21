import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const dataRoot = path.join(projectRoot, 'bench/grounding');
export const armSchema = z.enum(['baseline', 'groundwork']);
export type Arm = z.infer<typeof armSchema>;
export const taskSchema = z.object({
  id: z.string().regex(/^[a-z][a-z-]+$/), repo: z.enum(['customer-desk', 'parcel-ops', 'dispatch-desk']),
  entry: z.string(), prompt: z.string().min(30), target: z.enum(['src/workflows.ts', 'dispatch/workflows.py']),
  symbols: z.array(z.string().regex(/^(src|dispatch)\/[\w-]+\.(ts|py)#[\w.]+$/)).min(1),
});
export type Task = z.infer<typeof taskSchema>;
export const repos = ['customer-desk', 'parcel-ops', 'dispatch-desk'] as const;
export function tasks(root = dataRoot): Task[] {
  const manifest = z.object({ version: z.literal(3), tasks: z.array(taskSchema).length(15) }).parse(JSON.parse(readFileSync(path.join(root, 'tasks.json'), 'utf8')));
  if (new Set(manifest.tasks.map((t) => t.id)).size !== 15 || repos.some((r) => manifest.tasks.filter((t) => t.repo === r).length !== 5))
    throw new Error('Expected 15 unique tasks, five per repository');
  return manifest.tasks;
}
export function filesUnder(root: string, prefix = ''): string[] {
  return readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap((e) => {
    const rel = path.posix.join(prefix, e.name);
    if (e.isSymbolicLink()) throw new Error(`Symlink not allowed in benchmark inputs: ${rel}`);
    return e.isDirectory() ? filesUnder(root, rel) : [rel];
  });
}
export function taskSetHash(root = dataRoot): string {
  const hash = createHash('sha256');
  for (const file of ['tasks.json', ...['repos', 'hidden', 'reference'].flatMap((dir) => filesUnder(path.join(root, dir)).map((f) => `${dir}/${f}`))]) {
    const bytes = readFileSync(path.join(root, file));
    hash.update(JSON.stringify([file, bytes.length])).update('\0').update(bytes);
  }
  return hash.digest('hex');
}

export const siblingPairs: Record<Task['repo'], [string, string][]> = {
  'customer-desk': [['getUserById', 'getUserByEmail'], ['listClosedForUser', 'listOpenForUser'], ['readBillingPolicy', 'readContactPolicy'], ['renderReminder', 'renderWelcome'], ['getDisplayAddress', 'getPrimaryAddress']],
  'parcel-ops': [['quoteReturn', 'quoteShipment'], ['summarizeLineItem', 'summarizeOrder'], ['formatReturn', 'formatDispatch']],
  'dispatch-desk': [['get_billing_email', 'get_primary_email'], ['quote_return', 'quote_delivery'], ['subtotal', 'total_due']],
};

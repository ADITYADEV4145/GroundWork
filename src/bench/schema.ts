import { z } from 'zod';

const label = z.string().regex(/^[a-z][a-z0-9-]*$/);
const count = z.number().int().nonnegative();
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const metricNames = z.string().regex(/^[a-z][a-zA-Z0-9_]*$/);
export const condition = z.enum(['baseline', 'groundwork', 'serena', 'codebase-memory']);
export const taskSchema = z.object({
  id: label,
  repo: label,
  category: label,
  prompt: z.string().min(1),
  edit: z.boolean().optional(),
  sequence: label.optional(),
  step: z.number().int().positive().optional(),
}).refine((task) => (task.sequence === undefined) === (task.step === undefined),
  'sequence and step must be specified together');
export const suiteSchema = z.object({
  revision,
  tasks: z.array(taskSchema).min(1),
}).refine(({ tasks }) => new Set(tasks.map((task) => task.id)).size === tasks.length, 'duplicate task id');
export type Task = z.infer<typeof taskSchema>;
export type Suite = z.infer<typeof suiteSchema>;

const usage = z.object({ inputTokens: count, outputTokens: count });
export const observationSchema = z.object({
  task: label,
  startedAt: count,
  wallMs: count,
  endedAt: count.optional(),
  answer: z.array(z.string()).max(100).optional(),
  patch: z.string().max(1_000_000).optional(),
  usage: usage.optional(),
  tools: z.array(z.object({
    action: z.enum(['mcp', 'shell', 'read']),
    name: z.string().optional(),
    bytes: count.max(16_000),
    readBytes: count.optional(),
    file: z.string().optional(),
    blocked: z.boolean().optional(),
    startedAt: count.optional(),
    endedAt: count.optional(),
    durationMs: z.number().finite().nonnegative().optional(),
  }).refine((t) => {
    const times = [t.startedAt, t.endedAt, t.durationMs];
    return times.every((x) => x === undefined) || (times.every((x) => x !== undefined) && t.endedAt! >= t.startedAt!);
  }, 'Incomplete or reversed action timing')).max(1_000),
}).refine((o) => o.endedAt === undefined || o.endedAt === o.startedAt + o.wallMs, 'Inconsistent task end');
export type Observation = z.infer<typeof observationSchema>;

const runMetadata = z.object({
  suite: label,
  revision,
  condition,
  run: count.positive(),
  agent: z.string().min(1),
  model: z.string().nullable(),
  node: z.string().min(1),
  captureRevision: revision,
  sessionUrl: z.url().optional(),
  protocol: z.literal('stable-v1').optional(),
  sessionStartedAt: count.optional(),
  sessionEndedAt: count.optional(),
  sessionStartBasis: z.enum(['workspace-ready', 'first-captured-action']).optional(),
});
export const captureSchema = runMetadata.extend({ observations: z.array(observationSchema).min(1) }).refine((c) =>
  c.protocol !== 'stable-v1' || (c.sessionStartedAt !== undefined && c.sessionEndedAt !== undefined && c.sessionStartBasis !== undefined &&
    c.sessionEndedAt >= c.sessionStartedAt && c.observations.every((o) => o.endedAt !== undefined && o.startedAt >= c.sessionStartedAt! && o.endedAt <= c.sessionEndedAt! &&
      o.tools.every((t) => t.startedAt !== undefined && t.startedAt >= o.startedAt && t.endedAt! <= o.endedAt!))), 'Incomplete stable timing');
export type Capture = z.infer<typeof captureSchema>;

export const gradeSchema = z.union([z.boolean(), z.object({
  success: z.boolean(),
  metrics: z.record(metricNames, z.number().finite()).optional(),
})]);
export const sampleSchema = z.object({
  task: label,
  success: z.boolean(),
  toolCalls: count,
  toolOutputBytes: count,
  filesRead: count,
  readBytes: count,
  readBlocks: count,
  wallMs: count,
  startedAt: count.optional(),
  endedAt: count.optional(),
  toolSideMs: z.number().finite().nonnegative().optional(),
  usage: usage.optional(),
  metrics: z.record(metricNames, z.number().finite()).optional(),
});
export type Sample = z.infer<typeof sampleSchema>;
export const evidenceSchema = z.object({
  format: z.literal(1),
  suite: label,
  suiteDigest: z.string().regex(/^[a-f0-9]{64}$/),
  captures: z.array(runMetadata.extend({ samples: z.array(sampleSchema).min(1) })).min(2),
});
export type Evidence = z.infer<typeof evidenceSchema>;

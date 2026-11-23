import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const dataRoot = path.join(projectRoot, 'bench/defects-at-done');

export const CATEGORIES = ['hidden-helper', 'near-name', 'changed-signature', 'ripple', 'compaction', 'real-failure'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

/** Defect types counted by the frozen graders after the agent stops. */
export const DEFECTS = ['inventedCalls', 'wrongArguments', 'duplicates', 'typeErrors', 'missedCallers', 'failingTests'] as const;
export type Defect = typeof DEFECTS[number];

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const relPath = z.string().regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[\w@./-]+$/);
const symbolRef = z.string().regex(/^[\w@./-]+#[\w.$]+$/);

export const repoSchema = z.object({
  id,
  language: z.enum(['typescript', 'javascript', 'python', 'go', 'java']),
  /** `fixture` repos live under bench/defects-at-done/repos/<id>; `git` repos are cloned at a pinned commit into an external cache. */
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('fixture') }),
    z.object({ kind: z.literal('git'), url: z.string().url(), sha: z.string().regex(/^[0-9a-f]{40}$/), license: z.string().min(2) }),
  ]),
  /** Command that runs the visible tests, from the repo root. */
  test: z.array(z.string()).min(1),
  /** Command that runs one test file; the file path is appended. */
  testOne: z.array(z.string()).min(1),
  /** Python modules the tests import that the repo does not ship. A host without them cannot grade the repo's tasks. */
  requires: z.array(z.string().regex(/^[A-Za-z_][\w.]*$/)).optional(),
  /** Oldest Python the repo supports, as `major.minor`. An older host cannot grade the repo's tasks. */
  python: z.string().regex(/^\d+\.\d+$/).optional(),
});
export type Repo = z.infer<typeof repoSchema>;

export const taskSchema = z.object({
  id,
  repo: id,
  category: categorySchema,
  prompt: z.string().min(40),
  /** Follow-up turns for multi-turn tasks. `compactBefore` asks the harness to compact or restart context before that turn. */
  turns: z.array(z.object({ prompt: z.string().min(20), compactBefore: z.boolean().default(false) })).default([]),
  /** Where the work is expected to land; graders never require it. */
  entry: relPath,
  /** The trap: what an agent is likely to get wrong. Private, never copied into a workspace. */
  trap: z.object({
    /** Existing symbols a correct solution reuses or calls. */
    existing: z.array(symbolRef).default([]),
    /** Callers and tests a correct change must update or run (ripple tasks). */
    affected: z.array(relPath).default([]),
    /** Names that look right but are wrong for this task (near-name, changed-signature). */
    decoys: z.array(z.string().min(1)).default([]),
  }).default({ existing: [], affected: [], decoys: [] }),
  /** Hidden acceptance script under hidden/, run with the workspace as cwd; exit 0 means success. */
  hidden: relPath,
  /** Tests the agent must leave passing, relative to the repo (run by the repo's test command). */
  affectedTests: z.array(relPath).default([]),
  /** Where a real-failure task came from: a public PR, issue or a transcript shared with permission. */
  provenance: z.string().url().optional(),
}).superRefine((task, ctx) => {
  const need = (ok: boolean, message: string) => { if (!ok) ctx.addIssue({ code: 'custom', message: `${task.id}: ${message}` }); };
  if (task.category === 'hidden-helper' || task.category === 'compaction') need(task.trap.existing.length > 0, `${task.category} needs the existing helper`);
  if (task.category === 'near-name' || task.category === 'changed-signature') need(task.trap.decoys.length > 0 && task.trap.existing.length > 0, `${task.category} needs the right symbol and a decoy`);
  if (task.category === 'ripple') need(task.trap.affected.length >= 2, 'ripple needs at least two affected callers or tests');
  if (task.category === 'real-failure') need(!!task.provenance, 'real-failure needs a provenance URL');
  if (task.category === 'compaction') need(task.turns.some((t) => t.compactBefore), 'compaction needs a turn after compaction');
});
export type Task = z.infer<typeof taskSchema>;

export const manifestSchema = z.object({
  version: z.literal(1),
  repos: z.array(repoSchema).min(1),
  tasks: z.array(taskSchema).min(1),
}).superRefine((m, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const repos = new Set(m.repos.map((r) => r.id));
  if (repos.size !== m.repos.length) issue('Repository ids must be unique');
  if (new Set(m.tasks.map((t) => t.id)).size !== m.tasks.length) issue('Task ids must be unique');
  for (const t of m.tasks) if (!repos.has(t.repo)) issue(`${t.id}: unknown repo ${t.repo}`);
});
export type Manifest = z.infer<typeof manifestSchema>;

export function loadManifest(root = dataRoot): Manifest {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(root, 'tasks.json'), 'utf8')));
  for (const t of manifest.tasks) if (!existsSync(path.join(root, 'hidden', t.hidden))) throw new Error(`${t.id}: missing hidden check ${t.hidden}`);
  for (const r of manifest.repos) if (r.source.kind === 'fixture' && !existsSync(path.join(root, 'repos', r.id))) throw new Error(`Missing fixture repo ${r.id}`);
  return manifest;
}

export function filesUnder(root: string, prefix = ''): string[] {
  if (!existsSync(path.join(root, prefix))) return [];
  return readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap((e) => {
    const rel = path.posix.join(prefix, e.name);
    if (e.isSymbolicLink()) throw new Error(`Symlink not allowed in benchmark inputs: ${rel}`);
    return e.isDirectory() ? filesUnder(root, rel) : [rel];
  });
}

/** Covers prompts, traps, fixture repos, hidden checks and the frozen grader source. Stored results must match it exactly. */
export function taskSetHash(root = dataRoot): string {
  const hash = createHash('sha256');
  const add = (label: string, file: string) => {
    const bytes = readFileSync(file);
    hash.update(JSON.stringify([label, bytes.length])).update('\0').update(bytes);
  };
  add('tasks.json', path.join(root, 'tasks.json'));
  for (const dir of ['repos', 'hidden']) for (const f of filesUnder(path.join(root, dir))) add(`${dir}/${f}`, path.join(root, dir, f));
  const graders = path.join(projectRoot, 'src/bench/defects');
  for (const f of ['grade.ts']) add(`grader/${f}`, path.join(graders, f));
  return hash.digest('hex');
}

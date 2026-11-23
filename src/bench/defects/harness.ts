import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import { grade, GRADER_VERSION, type Grade } from './grade.js';
import { dataRoot, loadManifest, projectRoot, taskSetHash, type Repo, type Task } from './tasks.js';
import { git, materialize, snapshotSetup, taskPrompt, writeJson } from './workspaces.js';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const mcpServer = z.object({ name: id, command: z.string().min(1), args: z.array(z.string()).default([]), env: z.record(z.string(), z.string()).default({}) });
export const armSchema = z.discriminatedUnion('kind', [
  z.object({ id, label: z.string(), kind: z.literal('native') }),
  z.object({ id, label: z.string(), kind: z.literal('groundwork'), profile: z.enum(['minimal', 'standard', 'strict']), config: z.record(z.string(), z.unknown()).optional() }),
  /** A competitor installed per its own documentation. It cannot run until its version and launch command are pinned here. */
  z.object({ id, label: z.string(), kind: z.literal('mcp'), docs: z.string().url(), version: z.string().min(1).nullable(), mcp: mcpServer.nullable(), setup: z.array(z.array(z.string()).min(1)).default([]) }),
]);
export type Arm = z.infer<typeof armSchema>;
const armsFile = z.object({ version: z.literal(1), arms: z.array(armSchema).min(2) });

export const agentSchema = z.object({
  id,
  /** argv with {prompt}, {model}, {maxTurns} and {mcpConfig} placeholders; run with the workspace as cwd. */
  command: z.array(z.string()).min(1),
  /** Extra argv for a follow-up turn that keeps the conversation. Turns marked compactBefore start a fresh conversation instead. */
  continue: z.array(z.string()).default([]),
  usage: z.enum(['claude-json', 'none']),
});
export type Agent = z.infer<typeof agentSchema>;
const agentsFile = z.object({ version: z.literal(1), agents: z.array(agentSchema).min(1) });

export function loadArms(root = dataRoot): Arm[] {
  const arms = armsFile.parse(JSON.parse(readFileSync(path.join(root, 'arms.json'), 'utf8'))).arms;
  if (new Set(arms.map((a) => a.id)).size !== arms.length) throw new Error('Arm ids must be unique');
  return arms;
}
export function loadAgent(name: string, root = dataRoot): Agent {
  const agent = agentsFile.parse(JSON.parse(readFileSync(path.join(root, 'agents.json'), 'utf8'))).agents.find((a) => a.id === name);
  if (!agent) throw new Error(`Unknown agent ${name}`);
  return agent;
}
/** Why an arm cannot run yet, or null when it can. */
function onPath(tool: string): boolean {
  if (tool.includes(path.sep)) return existsSync(tool);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  return (process.env.PATH ?? '').split(path.delimiter).some((dir) => dir && exts.some((ext) => existsSync(path.join(dir, tool + ext))));
}

export function armBlocker(arm: Arm): string | null {
  if (arm.kind === 'mcp' && (!arm.version || !arm.mcp)) return `${arm.id} has no pinned version and launch command in arms.json (install per ${arm.docs})`;
  if (arm.kind === 'groundwork' && !existsSync(path.join(projectRoot, 'dist/cli/main.js'))) return 'GroundWork is not built: run npm run build';
  return null;
}

export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number | null }
export interface RunRecord {
  format: 1;
  taskSetHash: string;
  graderVersion: number;
  run: string;
  arm: string;
  armVersion: string;
  agent: string;
  model: string;
  task: string;
  category: string;
  replicate: number;
  startedAt: string;
  wallMs: number;
  /** Provider-billed tokens summed over turns; null when the agent did not report them. */
  usage: Usage | null;
  toolCalls: number | null;
  turns: { exit: number | null; timedOut: boolean; wallMs: number; transcript: string }[];
  grade: Grade | null;
  /** Empty for a valid record. Invalid records stay in the results and are reported, never dropped. */
  invalid: string[];
}

export interface RunOptions {
  run: string; out: string; arms: string[]; agent: string; model: string; replicates: number;
  /** Preregistration document, relative to the GroundWork checkout. It must be committed and unmodified; without it the run is exploratory. */
  prereg?: string;
  tasks?: string[]; maxTurns?: number; timeoutMs?: number; cache?: string; root?: string;
  /** Test seam: replaces the agent process. */
  execute?: (context: { task: Task; repo: Repo; arm: Arm; dir: string; turn: number; prompt: string; fresh: boolean }) => TurnResult;
  log?: (line: string) => void;
}
export interface TurnResult { exit: number | null; timedOut: boolean; stdout: string; stderr: string }

/** A preregistration counts only if the exact file is committed before the run starts. */
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function registered(file: string, root = projectRoot): { file: string; commit: string; committedAt: string; sha256: string } {
  const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
  if (rel.startsWith('..') || !existsSync(path.join(root, rel))) throw new Error(`No preregistration at ${file}`);
  if (git(root, 'status', '--porcelain', '--', rel)) throw new Error(`${rel} has uncommitted changes; commit the preregistration before running`);
  const [commit, committedAt] = git(root, 'log', '-1', '--format=%H %cI', '--', rel).split(' ');
  if (!commit || !committedAt) throw new Error(`${rel} is not committed`);
  return { file: rel, commit, committedAt, sha256: createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex') };
}

const sh = (cwd: string, argv: string[], timeout = 300_000) => {
  const r = spawnSync(argv[0]!, argv.slice(1), { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${argv.join(' ')} failed: ${r.error?.message ?? (r.stderr || r.stdout).slice(0, 400)}`);
};

function merge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(over))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  return out;
}

/** Installs the arm's tool into a workspace and returns the MCP config file the agent is launched with and the tool version. */
export function installArm(arm: Arm, dir: string, state: string): { mcpConfig: string; version: string } {
  const mcpConfig = path.join(state, 'mcp.json');
  mkdirSync(state, { recursive: true });
  let servers: Record<string, unknown> = {}, version = 'none';
  if (arm.kind === 'groundwork') {
    const gw = [process.execPath, path.join(projectRoot, 'dist/cli/main.js')];
    sh(dir, [...gw, 'init']);
    sh(dir, [...gw, 'setup', '--agent', 'claude', '--profile', arm.profile, '--command', gw.join(' '), '--yes']);
    if (arm.config) {
      const file = path.join(dir, '.groundwork/config.json');
      writeJson(file, merge(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> : {}, arm.config));
    }
    servers = { groundwork: { command: gw[0], args: [gw[1], 'mcp'] } };
    version = `${(JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as { version: string }).version}+${git(projectRoot, 'rev-parse', 'HEAD')}`;
  } else if (arm.kind === 'mcp') {
    for (const step of arm.setup) sh(dir, step);
    servers = { [arm.mcp!.name]: { command: arm.mcp!.command, args: arm.mcp!.args, env: arm.mcp!.env } };
    version = arm.version!;
  }
  writeJson(mcpConfig, { mcpServers: servers });
  return { mcpConfig, version };
}

function runAgent(agent: Agent, dir: string, values: Record<string, string>, fresh: boolean, timeoutMs: number): TurnResult {
  const argv = [...agent.command, ...(fresh ? [] : agent.continue)].map((a) => a.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m));
  const r = spawnSync(argv[0]!, argv.slice(1), { cwd: dir, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  const timedOut = (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
  return { exit: r.status, timedOut, stdout: r.stdout ?? '', stderr: (r.stderr ?? '') + (r.error && !timedOut ? `\n${r.error.message}` : '') };
}

/** Reads provider-billed usage from one turn's output. Returns null rather than estimating. */
export function parseUsage(kind: Agent['usage'], stdout: string): { usage: Usage; toolCalls: number | null } | null {
  if (kind !== 'claude-json') return null;
  try {
    const out = JSON.parse(stdout) as { usage?: Record<string, number>; total_cost_usd?: number; num_turns?: number };
    const u = out.usage;
    if (!u || typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return null;
    return { usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0, costUsd: typeof out.total_cost_usd === 'number' ? out.total_cost_usd : null }, toolCalls: null };
  } catch { return null; }
}

export const recordPath = (out: string, run: string, arm: string, task: string, replicate: number) => path.join(out, run, 'records', arm, `${task}.${replicate}.json`);

/**
 * Runs every task x arm x replicate in a fresh workspace with the same agent, model, prompt and budgets, then grades it.
 * Existing records are kept (a run can resume) and never overwritten; arms that cannot run are listed, not skipped silently.
 */
export async function runSuite(options: RunOptions): Promise<{ records: number; skipped: number; blocked: { arm: string; reason: string }[]; directory: string }> {
  const root = options.root ?? dataRoot, manifest = loadManifest(root), log = options.log ?? (() => {});
  const out = path.resolve(options.out);
  const checkout = path.resolve(projectRoot);
  if (out === checkout || out.startsWith(checkout + path.sep)) throw new Error('Run workspaces must live outside the GroundWork checkout');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.run)) throw new Error('Run id must be lowercase letters, digits and dashes');
  const all = loadArms(root), wanted = options.arms.includes('all') ? all : options.arms.map((a) => {
    const arm = all.find((x) => x.id === a);
    if (!arm) throw new Error(`Unknown arm ${a}`);
    return arm;
  });
  const agent = options.execute ? { id: options.agent, command: ['-'], continue: [], usage: 'none' as const } : loadAgent(options.agent, root);
  const tasks = manifest.tasks.filter((t) => !options.tasks || options.tasks.includes(t.id));
  if (!tasks.length) throw new Error('No tasks selected');
  const hash = taskSetHash(root), blocked: { arm: string; reason: string }[] = [];
  const meta = path.join(out, options.run, 'run.json');
  const header = { format: 1, run: options.run, taskSetHash: hash, graderVersion: GRADER_VERSION, agent: agent.id, model: options.model,
    // The agent definition is part of the treatment: a run cannot resume after it changes.
    agentHash: sha(agent),
    preregistration: options.prereg ? registered(options.prereg) : null,
    replicates: options.replicates, maxTurns: options.maxTurns ?? 60, timeoutMs: options.timeoutMs ?? 1_200_000, tasks: tasks.map((t) => t.id) };
  if (existsSync(meta)) {
    const previous = JSON.parse(readFileSync(meta, 'utf8')) as Record<string, unknown>;
    for (const key of Object.keys(header) as (keyof typeof header)[])
      if (JSON.stringify(previous[key]) !== JSON.stringify(header[key])) throw new Error(`Run ${options.run} was started with a different ${key}; use a new run id`);
    // Same for each arm's definition, checked per arm so a competitor pinned later can still join the run.
    const arms = (previous.arms ?? {}) as Record<string, string>;
    for (const arm of wanted) {
      if (arms[arm.id] && arms[arm.id] !== sha(arm)) throw new Error(`Run ${options.run} was started with a different definition of arm ${arm.id}; use a new run id`);
      arms[arm.id] = sha(arm);
    }
    writeJson(meta, { ...previous, arms });
  } else writeJson(meta, { ...header, arms: Object.fromEntries(wanted.map((a) => [a.id, sha(a)])), startedAt: new Date().toISOString() });

  // A missing toolchain would only show up at grading, after the agent had run and the record was already kept as invalid.
  for (const id of new Set(tasks.map((t) => t.repo))) {
    const tool = manifest.repos.find((r) => r.id === id)!.test[0]!;
    if (!onPath(tool)) throw new Error(`${tool} is not on PATH; it is needed to grade ${id} tasks`);
  }
  let records = 0, skipped = 0;
  for (const arm of wanted) {
    const reason = armBlocker(arm);
    if (reason) { blocked.push({ arm: arm.id, reason }); log(`blocked ${arm.id}: ${reason}`); continue; }
    // Replicates are the outer loop so that a partial run is balanced across tasks.
    for (let replicate = 1; replicate <= options.replicates; replicate++) for (const task of tasks) {
      const file = recordPath(out, options.run, arm.id, task.id, replicate);
      if (existsSync(file)) { skipped++; continue; }
      const repo = manifest.repos.find((r) => r.id === task.repo)!;
      const session = path.join(out, options.run, 'sessions', arm.id, `${task.id}.${replicate}`), dir = path.join(session, 'workspace');
      const record: RunRecord = { format: 1, taskSetHash: hash, graderVersion: GRADER_VERSION, run: options.run, arm: arm.id, armVersion: 'none', agent: agent.id,
        model: options.model, task: task.id, category: task.category, replicate, startedAt: new Date().toISOString(), wallMs: 0, usage: null, toolCalls: null,
        turns: [], grade: null, invalid: [] };
      try {
        mkdirSync(session, { recursive: true });
        materialize(repo, dir, { root, ...(options.cache ? { cache: options.cache } : {}) });
        const installed = installArm(arm, dir, path.join(session, 'state'));
        const base = snapshotSetup(dir);
        record.armVersion = installed.version;
        let usage: Usage | null = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
        for (let turn = 0; turn <= task.turns.length; turn++) {
          const fresh = turn === 0 || task.turns[turn - 1]!.compactBefore, prompt = taskPrompt(task, turn), started = performance.now();
          const result = options.execute ? options.execute({ task, repo, arm, dir, turn, prompt, fresh })
            : runAgent(agent, dir, { prompt, model: options.model, maxTurns: String(header.maxTurns), mcpConfig: installed.mcpConfig }, fresh, header.timeoutMs);
          const wallMs = Math.round(performance.now() - started), transcript = path.join(session, `turn-${turn}.json`);
          writeFileSync(transcript, JSON.stringify({ prompt, fresh, ...result }, null, 2));
          record.turns.push({ exit: result.exit, timedOut: result.timedOut, wallMs, transcript: path.relative(path.join(out, options.run), transcript) });
          record.wallMs += wallMs;
          if (result.timedOut) record.invalid.push(`turn ${turn} hit the time budget`);
          else if (result.exit !== 0) record.invalid.push(`turn ${turn} exited ${result.exit}: ${result.stderr.slice(-200)}`);
          const parsed = parseUsage(agent.usage, result.stdout);
          if (!parsed) usage = null;
          else if (usage) {
            usage.inputTokens += parsed.usage.inputTokens; usage.outputTokens += parsed.usage.outputTokens;
            usage.cacheReadTokens += parsed.usage.cacheReadTokens; usage.cacheWriteTokens += parsed.usage.cacheWriteTokens;
            usage.costUsd = usage.costUsd === null || parsed.usage.costUsd === null ? null : usage.costUsd + parsed.usage.costUsd;
          }
        }
        record.usage = usage;
        record.grade = await grade(task, repo, dir, base, root);
        record.invalid.push(...record.grade.invalid);
      } catch (e) { record.invalid.push(`harness: ${(e as Error).message}`); }
      writeJson(file, record);
      records++;
      log(`${arm.id} ${task.id} #${replicate}: ${record.invalid.length ? 'INVALID' : `${record.grade!.totalDefects} defects, ${record.grade!.success ? 'success' : 'failed'}`}`);
    }
  }
  const notRunFile = path.join(out, options.run, 'not-run.json');
  const earlier = existsSync(notRunFile) ? JSON.parse(readFileSync(notRunFile, 'utf8')) as { arm: string; reason: string }[] : [];
  writeJson(notRunFile, [...earlier.filter((e) => !wanted.some((a) => a.id === e.arm)), ...blocked]);
  return { records, skipped, blocked, directory: path.join(out, options.run) };
}

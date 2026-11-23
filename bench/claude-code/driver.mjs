// Dev-only: drives Claude Code through the navigation and long-horizon suites and records provider-billed usage.
// Nothing here runs without an explicit `run` command; see bench/prereg/claude-code-speed-v1.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyPatch, git, unpackWorkspace } from '../workspace.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../..');
export const PROTOCOL = 'claude-code-speed-v1';
export const SESSIONS_PER_ARM = 16;
const SETUP_FILES = [':(exclude).groundwork/**', ':(exclude).claude/**', ':(exclude)CLAUDE.md', ':(exclude).mcp.json', ':(exclude)**/__pycache__/**'];
const ANSWER = '\n\nDo not edit files. End your reply with one line holding only a JSON array of the definitions asked for, each written as "path/from/repo/root:Name" (methods as "path:Class.method").';
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const saveJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const isEdit = (task) => task.edit ?? ['fix', 'feature'].includes(task.category);
export const loadSuite = (suite) => {
  if (!['nav', 'long-horizon'].includes(suite)) throw new Error('Suite must be nav or long-horizon');
  return readJson(path.join(here, '..', suite, 'tasks.json'));
};

/** The last JSON array of strings in the agent's reply, or null when it gave none. */
export function parseAnswer(text) {
  // lastIndexOf clamps a negative start to 0, so each loop stops by hand at index 0.
  for (let end = text.lastIndexOf(']'); end >= 0; end = end > 0 ? text.lastIndexOf(']', end - 1) : -1) {
    for (let start = text.lastIndexOf('[', end); start >= 0; start = start > 0 ? text.lastIndexOf('[', start - 1) : -1) {
      try {
        const value = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
      } catch { /* keep looking */ }
    }
  }
  return null;
}

/** Provider-billed usage from Claude Code's JSON result. Null, never an estimate, when it is absent. */
export function parseResult(stdout) {
  let out;
  try { out = JSON.parse(stdout); } catch { return { text: '', usage: null, turns: null }; }
  const u = out?.usage, n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const usage = u && n(u.input_tokens) !== null && n(u.output_tokens) !== null ? {
    inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: n(u.cache_read_input_tokens) ?? 0,
    cacheWriteTokens: n(u.cache_creation_input_tokens) ?? 0, costUsd: n(out.total_cost_usd),
  } : null;
  return { text: typeof out?.result === 'string' ? out.result : '', usage, turns: n(out?.num_turns), isError: out?.is_error === true };
}
export const billedTokens = (u) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;

function prepare(suite, tasks, task, dir, treatment) {
  const root = path.join(dir, task.id);
  // A task interrupted before its record was saved left its workspace behind; start it again from the pin.
  rmSync(root, { recursive: true, force: true });
  unpackWorkspace(source, suite.revision, task.repo, root);
  for (const prior of tasks.filter((t) => task.sequence && t.sequence === task.sequence && t.step < task.step).sort((a, b) => a.step - b.step)) {
    const record = readJson(path.join(dir, prior.id + '.json'));
    applyPatch(root, record.patch, prior.id);
  }
  const mcpConfig = path.join(dir, task.id + '.mcp.json');
  let servers = {};
  if (treatment) {
    const gw = [process.execPath, path.join(source, 'dist/cli/main.js')];
    for (const args of [['init'], ['setup', '--agent', 'claude', '--profile', 'standard', '--command', gw.join(' '), '--yes']]) {
      const r = spawnSync(gw[0], [gw[1], ...args], { cwd: root, encoding: 'utf8', timeout: 300_000 });
      if (r.error || r.status !== 0) throw new Error(`gw ${args[0]} failed: ${r.error?.message ?? r.stderr.slice(0, 400)}`);
    }
    servers = { groundwork: { command: gw[0], args: [gw[1], 'mcp'] } };
  }
  saveJson(mcpConfig, { mcpServers: servers });
  return { root, mcpConfig };
}

/**
 * One session: every task of the suite in manifest order, each in a fresh Claude Code conversation and a fresh pinned workspace.
 * Finished task records are kept and never overwritten, so an interrupted session resumes; a failed task stays as a record.
 */
export function runSession({ suite: name, arm, run, model, out, maxTurns = 40, timeoutMs = 900_000, claude = ['claude'], log = () => {} }) {
  const suite = loadSuite(name), tasks = suite.tasks;
  if (!['baseline', 'groundwork'].includes(arm)) throw new Error('Arm must be baseline or groundwork');
  if (!Number.isInteger(run) || run < 1 || run > SESSIONS_PER_ARM) throw new Error(`Run must be 1 to ${SESSIONS_PER_ARM}`);
  if (!model) throw new Error('A model is required');
  const treatment = arm === 'groundwork';
  if (treatment && !existsSync(path.join(source, 'dist/cli/main.js'))) throw new Error('Run npm run build first');
  const outDir = path.resolve(out);
  if (outDir === source || outDir.startsWith(source + path.sep)) throw new Error('Session state must live outside the GroundWork checkout');
  const dir = path.join(outDir, name, arm, String(run)), metaFile = path.join(dir, 'metadata.json');
  mkdirSync(dir, { recursive: true });
  const captureRevision = git(source, 'rev-parse', 'HEAD').trim();
  const meta = existsSync(metaFile) ? readJson(metaFile) : { protocol: PROTOCOL, suite: name, revision: suite.revision, condition: arm, run,
    agent: 'claude-code', agentVersion: spawnSync(claude[0], [...claude.slice(1), '--version'], { encoding: 'utf8' }).stdout?.trim() || null,
    model, maxTurns, timeoutMs, node: process.version, captureRevision, sessionStartedAt: Date.now() };
  if (meta.model !== model || meta.captureRevision !== captureRevision || meta.maxTurns !== maxTurns || meta.timeoutMs !== timeoutMs) throw new Error('This session was started with a different model, budget or checkout');
  saveJson(metaFile, meta);
  for (const task of tasks) {
    const file = path.join(dir, task.id + '.json');
    if (existsSync(file)) continue;
    const invalid = [];
    let record = { task: task.id, startedAt: Date.now() };
    try {
      const { root, mcpConfig } = prepare(suite, tasks, task, dir, treatment);
      git(root, 'add', '-A');
      const base = git(root, 'write-tree').trim();
      const prompt = task.prompt + (isEdit(task) ? '' : ANSWER);
      record.startedAt = Date.now();
      const t0 = performance.now();
      const r = spawnSync(claude[0], [...claude.slice(1), '-p', prompt, '--output-format', 'json', '--model', model, '--max-turns', String(maxTurns),
        '--dangerously-skip-permissions', '--mcp-config', mcpConfig, '--strict-mcp-config'], { cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
      const wallMs = Math.round(performance.now() - t0), timedOut = r.error?.code === 'ETIMEDOUT';
      if (r.error && !timedOut) invalid.push(`Claude Code could not start: ${r.error.message}`);
      const parsed = parseResult(r.stdout ?? '');
      if (!parsed.usage) invalid.push('Claude Code reported no billed usage');
      writeFileSync(path.join(dir, task.id + '.transcript.json'), r.stdout ?? '');
      record = { ...record, endedAt: Date.now(), wallMs, exit: r.status, timedOut, usage: parsed.usage, turns: parsed.turns };
      if (isEdit(task)) {
        git(root, 'add', '-N', '--', '.');
        record.patch = git(root, 'diff', '--no-ext-diff', '--no-textconv', base, '--', '.', ...SETUP_FILES);
      } else record.answer = parseAnswer(parsed.text) ?? [];
    } catch (err) {
      invalid.push(`Harness error: ${err.message}`);
      record.endedAt = Date.now();
    }
    saveJson(file, { ...record, invalid });
    log(`${name} ${arm} run ${run} ${task.id}${invalid.length ? ' INVALID: ' + invalid.join('; ') : ''}`);
  }
  if (meta.sessionEndedAt === undefined) saveJson(metaFile, { ...meta, sessionEndedAt: Date.now() });
  return dir;
}

function withWorkspace(suite, tasks, task, observations) {
  return (fn) => {
    const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'gw-cc-grade-')), 'w');
    try {
      unpackWorkspace(source, suite.revision, task.repo, root);
      for (const prior of tasks.filter((t) => task.sequence && t.sequence === task.sequence && t.step <= task.step).sort((a, b) => a.step - b.step)) {
        applyPatch(root, observations.get(prior.id)?.patch, prior.id === task.id ? undefined : prior.id);
      }
      if (!task.sequence) applyPatch(root, observations.get(task.id)?.patch);
      return fn(root);
    } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
  };
}

/** Whole-session bootstrap of the ratio of arm means; same generator, seed and percentiles as bench/PROTOCOL.md. */
export function reduction(base, treat, draws = 10_000) {
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!base.length || !treat.length || mean(base) === 0) return null;
  let s = 0x51ab17ed;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; };
  const sample = (xs) => mean(xs.map(() => xs[Math.floor(next() * xs.length)]));
  const value = (b, t) => 100 * (1 - t / b), out = [];
  for (let i = 0; i < draws; i++) { const b = sample(base), t = sample(treat); if (b > 0) out.push(value(b, t)); }
  out.sort((a, b) => a - b);
  const at = (q) => out[Math.min(out.length - 1, Math.max(0, Math.ceil(q * out.length) - 1))];
  return { baselineMean: mean(base), groundworkMean: mean(treat), reductionPct: value(mean(base), mean(treat)), ci95: [at(0.025), at(0.975)], ci9875: [at(0.0125), at(0.9875)] };
}

/** Grades every session under `out` and reports per suite. Never repairs or drops a session: problems are listed. */
export async function report(out) {
  const result = { protocol: PROTOCOL, suites: {} };
  for (const name of ['nav', 'long-horizon']) {
    const suiteDir = path.join(path.resolve(out), name);
    if (!existsSync(suiteDir)) continue;
    const suite = loadSuite(name), { grade } = await import(pathToFileURL(path.join(here, '..', name, 'grade.mjs')).href);
    const arms = {}, problems = [];
    for (const arm of ['baseline', 'groundwork']) {
      const sessions = [];
      for (const run of existsSync(path.join(suiteDir, arm)) ? readdirSync(path.join(suiteDir, arm)).sort((a, b) => a - b) : []) {
        const dir = path.join(suiteDir, arm, run), meta = readJson(path.join(dir, 'metadata.json'));
        const observations = new Map(suite.tasks.flatMap((t) => existsSync(path.join(dir, t.id + '.json')) ? [[t.id, readJson(path.join(dir, t.id + '.json'))]] : []));
        const session = { run: meta.run, model: meta.model, captureRevision: meta.captureRevision, tokens: 0, costUsd: 0, wallMs: 0, successes: 0, byCategory: {}, invalid: [] };
        for (const task of suite.tasks) {
          const o = observations.get(task.id);
          if (!o) { session.invalid.push(`${task.id}: missing`); continue; }
          for (const reason of o.invalid ?? []) session.invalid.push(`${task.id}: ${reason}`);
          if (o.usage) { session.tokens += billedTokens(o.usage); session.costUsd = session.costUsd === null || o.usage.costUsd === null ? null : session.costUsd + o.usage.costUsd; }
          session.wallMs += o.wallMs ?? 0;
          let ok = false;
          try { const g = await grade(task, o, { withWorkspace: withWorkspace(suite, suite.tasks, task, observations) }); ok = g === true || g?.success === true; }
          catch (err) { session.invalid.push(`${task.id}: grader error: ${err.message}`); }
          const c = session.byCategory[task.category] ??= { ok: 0, n: 0 };
          c.n++; if (ok) { c.ok++; session.successes++; }
        }
        if (session.invalid.length) problems.push(`${arm} run ${run}: ${session.invalid.length} invalid task record(s)`);
        sessions.push(session);
      }
      arms[arm] = sessions;
    }
    const runs = (arm) => arms[arm].map((s) => s.run).join(',');
    const expected = Array.from({ length: SESSIONS_PER_ARM }, (_, i) => i + 1).join(',');
    for (const arm of ['baseline', 'groundwork']) if (runs(arm) !== expected) problems.push(`${arm} has runs [${runs(arm)}], the protocol needs exactly 1 to ${SESSIONS_PER_ARM}`);
    const all = [...arms.baseline, ...arms.groundwork];
    if (new Set(all.map((s) => `${s.model} ${s.captureRevision}`)).size > 1) problems.push('sessions differ in model or checkout');
    const metric = (f) => reduction(arms.baseline.map(f), arms.groundwork.map(f));
    const categories = {};
    for (const arm of ['baseline', 'groundwork']) for (const s of arms[arm]) for (const [c, v] of Object.entries(s.byCategory)) {
      const row = categories[c] ??= { baseline: 0, groundwork: 0 }; row[arm] += v.ok;
    }
    const guardrail = Object.values(categories).every((c) => c.groundwork >= c.baseline);
    const tokens = metric((s) => s.tokens);
    result.suites[name] = {
      tasks: suite.tasks.length, sessions: { baseline: arms.baseline.length, groundwork: arms.groundwork.length }, problems,
      confirmatory: problems.length === 0, successByCategory: categories, successGuardrail: guardrail,
      billedTokensPerSession: tokens, wallMsPerSession: metric((s) => s.wallMs),
      costUsdPerSession: all.every((s) => s.costUsd !== null) ? metric((s) => s.costUsd) : null,
      verdict: problems.length ? 'exploratory: no verdict' : !guardrail ? 'fail: fewer GroundWork successes in a category'
        : tokens && tokens.ci9875[0] > 0 ? 'billed-token reduction supported' : tokens && tokens.ci9875[1] < 0 ? 'billed-token increase' : 'inconclusive',
      perSession: arms,
    };
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2), opt = {};
  for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
  if (command === 'run') {
    runSession({ suite: opt.suite, arm: opt.arm, run: Number(opt.run), model: opt.model, out: opt.out,
      ...(opt['max-turns'] ? { maxTurns: Number(opt['max-turns']) } : {}), log: (line) => process.stderr.write(line + '\n') });
  } else if (command === 'report') {
    process.stdout.write(JSON.stringify(await report(opt.out), null, 2) + '\n');
  } else {
    process.stderr.write('Usage: driver.mjs run --suite nav|long-horizon --arm baseline|groundwork --run N --model M --out DIR\n       driver.mjs report --out DIR\n');
    process.exit(2);
  }
}

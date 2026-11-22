import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { applyPatch, git, unpackWorkspace } from './workspace.mjs';
import { snapshot, editEvents } from './multiturn-reuse/hooks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..');
const cli = path.join(source, 'dist/cli/main.js');
const suite = process.env.GW_BENCH_SUITE ?? 'nav';
if (!/^[a-z][a-z0-9-]*$/.test(suite)) throw new Error('Invalid suite name');
const { revision, tasks: allTasks, mcpTools = ['find_code', 'outline', 'read_symbol', 'explore', 'callers', 'callees', 'where_used', 'repo_map'] } =
  JSON.parse(readFileSync(path.join(here, suite, 'tasks.json'), 'utf8'));
const reuse = suite === 'multiturn-reuse';
const chain = reuse ? process.env.GW_BENCH_CHAIN : undefined;
const tasks = reuse ? allTasks.filter(t => t.sequence === chain) : allTasks;
if (reuse && (tasks.length !== 5 || process.env.GW_BENCH_PROTOCOL !== 'stable-v1')) throw new Error('Reuse capture requires stable-v1 and a valid GW_BENCH_CHAIN');
const taskRoot = (dir, task) => path.join(dir, reuse ? 'workspace' : task.id);
const MAX_RESPONSE_BYTES = 8_000;
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const saveJson = (file, value) => writeFileSync(file, JSON.stringify(value) + '\n');
const positiveInt = (str) => {
  if (!/^[1-9]\d*$/.test(str ?? '') || !Number.isSafeInteger(Number(str))) throw new Error('Expected a positive integer');
  return Number(str);
};

function restoreSequence(task, dir, root) {
  if (!task.sequence) return;
  const priorTasks = tasks.filter((t) => t.sequence === task.sequence && t.step < task.step).sort((a, b) => a.step - b.step);
  if (priorTasks.length !== task.step - 1 || priorTasks.some((t, i) => t.step !== i + 1 || t.repo !== task.repo)) {
    throw new Error('Sequence steps must be contiguous from 1 and use the same repo');
  }
  for (const prior of priorTasks) {
    const previous = readJson(path.join(dir, prior.id + '.json'));
    if (previous.wallMs === undefined) throw new Error('Finish ' + prior.id + ' before beginning ' + task.id);
    applyPatch(root, previous.patch, prior.id);
  }
}

function truncate(text, limit = MAX_RESPONSE_BYTES) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= limit) return text;
  if (limit < 64) return '';
  return bytes.subarray(0, limit - 64).toString('utf8') + '\n… truncated; narrow the search/read.\n';
}

function hook(root, event, tool, input, response, extra = {}) {
  try {
    const { status, stdout } = spawnSync(process.execPath, [cli, 'hook', 'claude', event], {
      cwd: root, input: JSON.stringify({ cwd: root, session_id: reuse ? 'reuse-' + createHash('sha256').update(root).digest('hex') : 'nav-benchmark', tool_name: tool,
        tool_input: input, tool_response: response, ...extra }),
      encoding: 'utf8', timeout: 5_000,
    });
    if (stdout && (status === 0 || status === 2)) {
      const result = JSON.parse(stdout);
      if (result && typeof result === 'object' && !Array.isArray(result)) return result;
    }
  } catch { /* Hooks fail open. */ }
  return {};
}

function hookText(result) {
  return [result.hookSpecificOutput?.additionalContext, result.systemMessage, result.reason]
    .filter(value => typeof value === 'string').join('\n');
}

function turnHook(observation, root, event, extra) {
  const startedAt = Date.now(), start = performance.now();
  if (event === 'prompt' && observation.task === tasks[0].id) {
    try {
      spawnSync(process.execPath, [cli, 'refresh'], { cwd: root, encoding: 'utf8', timeout: 5_000 });
    } catch { /* Initial index preparation must also fail open. */ }
  }
  const response = hook(root, event, undefined, undefined, undefined, extra);
  const blocked = response.decision === 'block' && typeof response.reason === 'string' && response.reason.length > 0;
  const text = truncate((blocked ? 'Stop blocked: ' : '') + hookText(response));
  observation.tools.push({ action: 'shell', name: 'hook:' + event,
    startedAt, endedAt: Date.now(), durationMs: performance.now() - start,
    bytes: Buffer.byteLength(text ? text + '\n' : '') });
  return { text, blocked };
}

function read(root, treatment, [file, start, count]) {
  const absolute = realpathSync(path.resolve(root, file));
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative) ||
      relative.split(path.sep).some((part) => part === '.git' || part === '.groundwork')) throw new Error('Read must stay inside the task workspace');
  const offset = start === undefined ? undefined : positiveInt(start);
  const limit = count === undefined ? undefined : positiveInt(count);
  const input = { file_path: absolute, offset, limit };
  const pre = treatment ? hook(root, 'pre_tool', 'Read', input).hookSpecificOutput : undefined;
  if (pre?.permissionDecision === 'deny') return { text: pre.permissionDecisionReason ?? 'Read denied', blocked: true };
  const first = offset ?? 1;
  const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const selected = lines.slice(first - 1, limit === undefined ? undefined : first - 1 + limit);
  const context = reuse && typeof pre?.additionalContext === 'string' ? pre.additionalContext : '';
  const budget = reuse && treatment ? Math.max(0, MAX_RESPONSE_BYTES - 64 - Buffer.byteLength(context ? context + '\n' : '')) : MAX_RESPONSE_BYTES;
  const content = truncate(selected.join('\n'), budget);
  let feedback = '';
  if (treatment && content) {
    // A truncated page may end mid-line. Only report complete lines to the read ledger.
    const actual = content === selected.join('\n') ? content : content.slice(0, content.lastIndexOf('\n… truncated')).split('\n').slice(0, -1).join('\n');
    if (actual) {
      const post = hook(root, 'post_tool', 'Read', input, {
        type: 'text', file: { filePath: absolute, startLine: first, numLines: actual.split('\n').length, content: actual },
      });
      if (reuse) feedback = hookText(post);
    }
  }
  return { text: (reuse ? [context, content, feedback] : [content, pre?.additionalContext])
    .filter(Boolean).join('\n'), file: relative, readBytes: Buffer.byteLength(content) };
}

async function mcp(root, [name, raw]) {
  if (!mcpTools.includes(name)) throw new Error('Use one of: ' + mcpTools.join(', '));
  const args = JSON.parse(raw ?? '{}');
  const client = new Client({ name: 'nav-benchmark', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], cwd: root, stderr: 'ignore' });
  let text;
  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 });
    text = result.content.map((part) => part.type === 'text' ? part.text : '[non-text MCP result]').join('\n');
    if (!result.isError && name === 'find_code') {
      const post = hook(root, 'post_tool', 'mcp__groundwork__find_code', args);
      if (reuse) text = [hookText(post), text].filter(Boolean).join('\n');
    }
  } finally {
    await client.close();
  }
  const location = name === 'read_symbol' && /^.*?([^\s]+\.(?:[cm]?[tj]sx?|py)):\d+.* \(definition lines .*\)\n/.exec(text);
  return { text, ...(location ? { file: location[1], readBytes: Buffer.byteLength(text.slice(text.indexOf('\n') + 1).split('\n… ')[0]) } : {}) };
}

async function main([action, ...argv]) {
  if (action === 'list') {
    if (process.env.GW_BENCH_PROTOCOL === 'stable-v1') {
      if (!argv[0] || readJson(path.join(argv[0], 'metadata.json')).protocol !== 'stable-v1') throw new Error('Stable list requires initialized STATE');
    }
    if (reuse) {
      const dir = argv[0];
      const meta = readJson(path.join(dir, 'metadata.json'));
      if (meta.chain !== chain) throw new Error('Wrong chain');
      const next = tasks.find(t => !existsSync(path.join(dir, t.id + '.json')) || readJson(path.join(dir, t.id + '.json')).wallMs === undefined);
      process.stdout.write(JSON.stringify(next ? [{ id: next.id, repo: next.repo, sequence: next.sequence, step: next.step }] : []) + '\n');
    } else process.stdout.write(JSON.stringify(tasks) + '\n');
    return;
  }
  const [directory, id, ...args] = argv;
  if (!directory) throw new Error('Usage: capture.mjs init <state> <baseline|groundwork> <run>; list; begin|read|mcp|shell|finish <state> <task> …; export <state>');
  const dir = path.resolve(directory);
  const metadata = path.join(dir, 'metadata.json');
  if (action === 'init') {
    if (!['baseline', 'groundwork'].includes(id)) throw new Error('Invalid condition');
    if (id === 'groundwork' && !existsSync(cli)) throw new Error('Run npm run build before collecting Groundwork observations');
    const run = positiveInt(args[0]);
    mkdirSync(dir);
    const stable = process.env.GW_BENCH_PROTOCOL === 'stable-v1';
    if (stable && run > 16) throw new Error('Stable protocol requires runs 1–16');
    if (stable) unpackWorkspace(source, revision, tasks[0].repo, taskRoot(dir, tasks[0]));
    saveJson(metadata, { suite, revision, condition: id, run, ...(stable ? { protocol: 'stable-v1', sessionStartedAt: Date.now(), sessionStartBasis: 'workspace-ready' } : {}), agent: process.env.GW_BENCH_AGENT ?? 'Devin normal',
      model: process.env.GW_BENCH_MODEL ?? null, node: process.version,
      captureRevision: git(source, 'rev-parse', 'HEAD').trim(), ...(reuse ? { chain } : {}) });
    return;
  }
  const meta = readJson(metadata);
  if (meta.suite !== suite || meta.revision !== revision || (reuse && meta.chain !== chain)) throw new Error('Capture state does not match this suite');
  if (action === 'export') {
    const observations = tasks.flatMap((task) => {
      const file = path.join(dir, task.id + '.json');
      return existsSync(file) ? [readJson(file)] : [];
    });
    process.stdout.write(JSON.stringify({ ...meta, observations }, null, 2) + '\n');
    return;
  }
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error('Unknown task');
  const root = taskRoot(dir, task);
  const record = path.join(dir, task.id + '.json');
  if (action === 'begin') {
    if (existsSync(record)) throw new Error('Task already begun');
    if (meta.protocol === 'stable-v1') {
      const position = tasks.indexOf(task);
      if (position && readJson(path.join(dir, tasks[position - 1].id + '.json')).wallMs === undefined) throw new Error('Finish previous task first');
    }
    if (!reuse) {
      if (!(meta.protocol === 'stable-v1' && task === tasks[0])) unpackWorkspace(source, revision, task.repo, root);
      restoreSequence(task, dir, root);
    }
    const observation = { task: task.id, startedAt: Date.now(), tools: [] };
    const context = reuse && meta.condition === 'groundwork'
      ? turnHook(observation, root, 'prompt', { hook_event_name: 'UserPromptSubmit', prompt: task.prompt }).text : '';
    saveJson(record, observation);
    if (reuse) process.stdout.write(JSON.stringify({ ...task, ...(context ? { hookContext: context } : {}) }) + '\n');
    return;
  }
  const observation = readJson(record);
  if (observation.wallMs !== undefined) throw new Error('Task already submitted');
  const treatment = meta.condition === 'groundwork';
  if (meta.sessionStartedAt === undefined) {
    meta.sessionStartedAt = Date.now();
    meta.sessionStartBasis = 'first-captured-action';
    saveJson(metadata, meta);
  }
  if (action === 'finish') {
    if (reuse && treatment) {
      const stopped = turnHook(observation, root, 'stop', { hook_event_name: 'Stop', stop_hook_active: false });
      if (stopped.text) process.stdout.write(stopped.text + '\n');
      if (stopped.blocked) {
        saveJson(record, observation);
        return;
      }
    }
    observation.endedAt = Date.now();
    observation.wallMs = observation.endedAt - observation.startedAt;
    if (observation.wallMs < 0) throw new Error('Clock reversal');
    if (task.edit ?? ['fix', 'feature'].includes(task.category)) {
      git(root, 'add', '-N', '--', '.');
      observation.patch = git(root, 'diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--', '.',
        ':(exclude).groundwork/**', ':(exclude)**/__pycache__/**');
    } else observation.answer = JSON.parse(args[0] ?? '[]');
    saveJson(record, observation);
    if (reuse) {
      git(root, 'add', '--', '.', ':(exclude).groundwork/**', ':(exclude)**/__pycache__/**');
      git(root, '-c', 'user.name=Groundwork benchmark', '-c', 'user.email=benchmark@example.invalid', 'commit', '--allow-empty', '-qm', 'Benchmark turn ' + task.step);
    }
    if (meta.protocol !== 'stable-v1' || task === tasks.at(-1)) {
      meta.sessionEndedAt = Date.now();
      saveJson(metadata, meta);
    }
    return;
  }
  const startedAt = Date.now();
  const monotonicStart = performance.now();
  let result;
  try {
    switch (action) {
      case 'read': result = read(root, treatment, args); break;
      case 'mcp':
        if (!treatment) throw new Error('MCP is unavailable in the baseline arm');
        result = await mcp(root, args);
        break;
      case 'shell': {
        const before = reuse && treatment ? snapshot(root) : null;
        const proc = spawnSync('sh', ['-c', args[0]], {
          cwd: root, encoding: 'utf8', timeout: 15_000, maxBuffer: 512 * 1024,
        });
        const feedback = [];
        if (reuse && treatment) for (const edit of editEvents(root, before, snapshot(root))) {
          feedback.push(hookText(hook(root, 'post_tool', edit.tool, edit.input,
            { success: proc.status === 0 }, { hook_event_name: 'PostToolUse' })));
        }
        result = { text: [...feedback, proc.stdout, proc.stderr, proc.error?.message].filter(Boolean).join('\n') };
        break;
      }
      default: throw new Error('Unknown capture action');
    }
  } catch (err) {
    result = { text: 'Error: ' + err.message };
  }
  const output = truncate(result.text);
  const emitted = output ? output.endsWith('\n') ? output : output + '\n' : '';
  const { text, ...detail } = result;
  const endedAt = Date.now();
  const durationMs = performance.now() - monotonicStart;
  if (endedAt < startedAt) throw new Error('Clock reversal');
  observation.tools.push({ action, ...(action === 'mcp' ? { name: args[0] } : {}), bytes: Buffer.byteLength(emitted), ...detail, startedAt, endedAt, durationMs });
  saveJson(record, observation);
  process.stdout.write(emitted);
}

await main(process.argv.slice(2));

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { applyPatch, git, unpackWorkspace } from './workspace.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..');
const cli = path.join(source, 'dist/cli/main.js');
const suite = process.env.GW_BENCH_SUITE ?? 'nav';
if (!/^[a-z][a-z0-9-]*$/.test(suite)) throw new Error('Invalid suite name');
const { revision, tasks, mcpTools = ['find_code', 'outline', 'read_symbol', 'explore', 'callers', 'callees', 'where_used', 'repo_map'] } =
  JSON.parse(readFileSync(path.join(here, suite, 'tasks.json'), 'utf8'));
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

function truncate(text) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= MAX_RESPONSE_BYTES) return text;
  return bytes.subarray(0, MAX_RESPONSE_BYTES - 64).toString('utf8') + '\n… truncated; narrow the search/read.\n';
}

function hook(root, event, tool, input, response) {
  const { status, stdout } = spawnSync(process.execPath, [cli, 'hook', 'claude', event], {
    cwd: root, input: JSON.stringify({ cwd: root, session_id: 'nav-benchmark', tool_name: tool,
      tool_input: input, tool_response: response }),
    encoding: 'utf8', timeout: 5_000,
  });
  if (stdout && (status === 0 || status === 2)) return JSON.parse(stdout);
  return {};
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
  const content = truncate(selected.join('\n'));
  if (treatment && content) {
    // A truncated page may end mid-line. Only report complete lines to the read ledger.
    const actual = content === selected.join('\n') ? content : content.slice(0, content.lastIndexOf('\n… truncated')).split('\n').slice(0, -1).join('\n');
    if (actual) hook(root, 'post_tool', 'Read', input, {
      type: 'text', file: { filePath: absolute, startLine: first, numLines: actual.split('\n').length, content: actual },
    });
  }
  return { text: [content, pre?.additionalContext].filter(Boolean).join('\n'), file: relative, readBytes: Buffer.byteLength(content) };
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
    if (!result.isError && name === 'find_code') hook(root, 'post_tool', 'mcp__groundwork__find_code', args);
  } finally {
    await client.close();
  }
  const location = name === 'read_symbol' && /^.*?([^\s]+\.(?:[cm]?[tj]sx?|py)):\d+.* \(definition lines .*\)\n/.exec(text);
  return { text, ...(location ? { file: location[1], readBytes: Buffer.byteLength(text.slice(text.indexOf('\n') + 1).split('\n… ')[0]) } : {}) };
}

async function main([action, ...argv]) {
  if (action === 'list') {
    process.stdout.write(JSON.stringify(tasks) + '\n');
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
    saveJson(metadata, { suite, revision, condition: id, run, agent: process.env.GW_BENCH_AGENT ?? 'Devin normal',
      model: process.env.GW_BENCH_MODEL ?? null, node: process.version,
      captureRevision: git(source, 'rev-parse', 'HEAD').trim() });
    return;
  }
  const meta = readJson(metadata);
  if (meta.suite !== suite || meta.revision !== revision) throw new Error('Capture state does not match this suite');
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
  const root = path.join(dir, task.id);
  const record = path.join(dir, task.id + '.json');
  if (action === 'begin') {
    unpackWorkspace(source, revision, task.repo, root);
    restoreSequence(task, dir, root);
    saveJson(record, { task: task.id, startedAt: Date.now(), tools: [] });
    return;
  }
  const observation = readJson(record);
  if (observation.wallMs !== undefined) throw new Error('Task already submitted');
  const treatment = meta.condition === 'groundwork';
  if (action === 'finish') {
    observation.wallMs = Date.now() - observation.startedAt;
    if (task.edit ?? ['fix', 'feature'].includes(task.category)) {
      git(root, 'add', '-N', '--', '.');
      observation.patch = git(root, 'diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--', '.',
        ':(exclude).groundwork/**', ':(exclude)**/__pycache__/**');
    } else observation.answer = JSON.parse(args[0] ?? '[]');
    saveJson(record, observation);
    return;
  }
  let result;
  try {
    switch (action) {
      case 'read': result = read(root, treatment, args); break;
      case 'mcp':
        if (!treatment) throw new Error('MCP is unavailable in the baseline arm');
        result = await mcp(root, args);
        break;
      case 'shell': {
        const proc = spawnSync('sh', ['-c', args[0]], {
          cwd: root, encoding: 'utf8', timeout: 15_000, maxBuffer: 512 * 1024,
        });
        result = { text: [proc.stdout, proc.stderr, proc.error?.message].filter(Boolean).join('\n') };
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
  observation.tools.push({ action, ...(action === 'mcp' ? { name: args[0] } : {}), bytes: Buffer.byteLength(emitted), ...detail });
  saveJson(record, observation);
  process.stdout.write(emitted);
}

await main(process.argv.slice(2));

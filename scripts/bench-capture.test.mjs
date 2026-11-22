import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const capture = fileURLToPath(new URL('../bench/capture.mjs', import.meta.url));
const { revision } = JSON.parse(readFileSync(new URL('../bench/nav/tasks.json', import.meta.url), 'utf8'));
const moduleUrl = (source) => 'data:text/javascript,' + encodeURIComponent(source);
const client = moduleUrl(`export class Client {
  async connect() {}
  async callTool({name, arguments: args}) { return {content: [{type: 'text', text: JSON.stringify({name, args})}]}; }
  async close() {}
}`);
const transport = moduleUrl('export class StdioClientTransport {}');
const loader = moduleUrl(`export async function resolve(s, c, next) {
  if (s === '@modelcontextprotocol/sdk/client/index.js') return {url: ${JSON.stringify(client)}, shortCircuit: true};
  if (s === '@modelcontextprotocol/sdk/client/stdio.js') return {url: ${JSON.stringify(transport)}, shortCircuit: true};
  return next(s, c);
}`);
const preload = moduleUrl(`import {register} from 'node:module'; register(${JSON.stringify(loader)}, import.meta.url);`);

test('stable session starts before disclosure, retains its clock across tasks and closes at last finish', () => {
  const parent = mkdtempSync(path.join(os.homedir(), 'gw-stable-capture-'));
  const tasks = JSON.parse(readFileSync(new URL('../bench/nav/tasks.json', import.meta.url), 'utf8')).tasks;
  try {
    const state = path.join(parent, 'state');
    const run = (...args) => spawnSync(process.execPath, [capture, ...args], { encoding: 'utf8', env: { ...process.env, GW_BENCH_PROTOCOL: 'stable-v1', GW_BENCH_SUITE: 'nav' } });
    assert.notEqual(run('list').status, 0);
    assert.equal(run('init', state, 'baseline', '1').status, 0);
    const first = JSON.parse(readFileSync(path.join(state, 'metadata.json')));
    assert.equal(first.sessionStartBasis, 'workspace-ready');
    assert.equal(run('list', state).status, 0);
    for (const task of tasks) {
      const begun = run('begin', state, task.id);assert.equal(begun.status, 0, begun.stderr);
      if (task === tasks[0]) {
        const empty = run('shell', state, task.id, 'true');assert.equal(empty.status, 0, empty.stderr);
        const failed = run('read', state, task.id, 'missing-file');assert.equal(failed.status, 0, failed.stderr);assert.match(failed.stdout, /Error:/);
      }
      const finished = run('finish', state, task.id, '[]');assert.equal(finished.status, 0, finished.stderr);
    }
    const exported = run('export', state);assert.equal(exported.status, 0, exported.stderr);
    const data = JSON.parse(exported.stdout);
    assert.equal(data.sessionStartedAt, first.sessionStartedAt);
    assert.ok(data.sessionEndedAt >= data.observations.at(-1).endedAt);
    assert.ok(data.observations[0].startedAt >= first.sessionStartedAt);
    assert.equal(data.observations[0].tools[0].bytes, 0);
    assert.equal(data.observations[0].tools.length, 2);
    for (const tool of data.observations[0].tools) { assert.ok(tool.durationMs >= 0);assert.ok(tool.endedAt >= tool.startedAt); }
    assert.notEqual(run('begin', state, tasks[0].id).status, 0);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('navigation capture allows explore only in the GroundWork arm and still rejects unknown tools', () => {
  const root = mkdtempSync(path.join(os.homedir(), 'gw-capture-allowlist-'));
  try {
    const run = (condition, tool, args = {}) => {
      const state = path.join(root, condition);
      mkdirSync(path.join(state, 'ts-01'), { recursive: true });
      writeFileSync(path.join(state, 'metadata.json'), JSON.stringify({ suite: 'nav', revision, condition, run: 1 }));
      writeFileSync(path.join(state, 'ts-01.json'), JSON.stringify({ task: 'ts-01', startedAt: Date.now(), tools: [] }));
      const result = spawnSync(process.execPath, ['--import', preload, capture, 'mcp', state, 'ts-01', tool, JSON.stringify(args)], {
        encoding: 'utf8', env: { ...process.env, GW_BENCH_SUITE: 'nav' },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      const observation = JSON.parse(readFileSync(path.join(state, 'ts-01.json'), 'utf8'));
      assert.equal(observation.tools[0].name, tool);
      assert.equal(observation.tools[0].bytes, Buffer.byteLength(result.stdout));
      assert.ok(observation.tools[0].endedAt >= observation.tools[0].startedAt);
      assert.ok(observation.tools[0].durationMs >= 0);
      return result.stdout;
    };
    assert.deepEqual(JSON.parse(run('groundwork', 'explore', { query: 'main' })), { name: 'explore', args: { query: 'main' } });
    assert.match(run('groundwork', 'not_a_tool'), /^Error: Use one of: .*explore/);
    assert.equal(run('baseline', 'explore'), 'Error: MCP is unavailable in the baseline arm\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

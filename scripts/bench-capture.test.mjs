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
      return result.stdout;
    };
    assert.deepEqual(JSON.parse(run('groundwork', 'explore', { query: 'main' })), { name: 'explore', args: { query: 'main' } });
    assert.match(run('groundwork', 'not_a_tool'), /^Error: Use one of: .*explore/);
    assert.equal(run('baseline', 'explore'), 'Error: MCP is unavailable in the baseline arm\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

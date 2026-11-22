import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectService, serviceInfo } from '../src/mcp/relay.js';
import { tempDir } from '../src/selftest/fixtures.js';

const main = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));
let root: string;
const clients: Client[] = [];
const source = 'export function normalize(value: string) { const result = value.trim().toLowerCase(); if (!result) throw new Error("empty"); return result; }';

async function client(): Promise<Client> {
  const value = new Client({ name: 'service-test', version: '1' });
  clients.push(value);
  await value.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', import.meta.resolve('tsx'), main, 'mcp'], cwd: root, stderr: 'pipe', env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)) }));
  return value;
}

async function call(value: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await value.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  return (result.content as { text: string }[]).map((c) => c.text).join('\n');
}

async function greeting(): Promise<{ pid: number; version: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(serviceInfo(root).socket);
    let data = '';
    socket.on('error', reject).on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\n')) { socket.destroy(); resolve(JSON.parse(data.split('\n')[0]!)); }
    });
  });
}

describe.skipIf(process.platform === 'win32')('persistent MCP service', () => {
  beforeEach(() => {
    root = tempDir('gw-service-');
    vi.stubEnv('GW_RUNTIME_DIR', path.join(root, 'run'));
    vi.stubEnv('GW_CACHE_DIR', path.join(root, 'cache'));
    vi.stubEnv('GW_MCP_IDLE_MS', '200');
    writeFileSync(path.join(root, 'app.ts'), source);
  });
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await delay(350);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('shares one service across concurrent clients, refreshes writes/config and expires idle', async () => {
    const [first, second] = await Promise.all([client(), client()]);
    const pid = (await greeting()).pid;
    expect(await call(first, 'find_code', { query: 'normalize' })).toContain('normalize');
    expect((await greeting()).pid).toBe(pid);
    const draft = { description: 'normalize input string', code: source };
    expect(await call(first, 'find_similar', draft)).toContain('normalize');
    writeFileSync(path.join(root, 'app.ts'), source.replace('normalize', 'renamed'));
    const updated = await call(second, 'find_similar', draft);
    expect(updated).toContain('renamed');
    expect(updated).not.toContain('normalize (');
    mkdirSync(path.join(root, '.groundwork'), { recursive: true });
    writeFileSync(path.join(root, '.groundwork/config.json'), JSON.stringify({ index: { exclude: ['**/*.ts'] } }));
    expect(await call(first, 'find_similar', draft)).toBe('No matches.');
    const file = serviceInfo(root).socket;
    await first.close(); await second.close();
    for (let i = 0; i < 80 && existsSync(file); i++) await delay(25);
    expect(existsSync(file)).toBe(false);
  }, 20000);

  it('falls back in-process when the runtime path is unavailable', async () => {
    vi.stubEnv('GW_RUNTIME_DIR', path.join(root, 'app.ts'));
    expect(await call(await client(), 'find_code', { query: 'normalize' })).toContain('normalize');
  });

  it('resumes a pending call in-process after its service dies, without a second initialize response', async () => {
    const value = await client();
    const errors: Error[] = [];
    value.onerror = (error) => { errors.push(error); };
    const pid = (await greeting()).pid;
    await call(value, 'find_code', { query: 'normalize' });
    for (let i = 0; i < 150; i++) writeFileSync(path.join(root, `extra-${i}.ts`), `export function extra${i}() { return ${i}; }`);
    const pending = call(value, 'find_code', { query: 'extra149' });
    await delay(5);
    process.kill(pid, 'SIGKILL');
    expect(await pending).toContain('extra149');
    expect(await call(value, 'read_symbol', { symbol: 'extra149' })).toContain('return 149');
    expect(errors).toEqual([]);
  }, 20000);

  it('rejects a mismatched version and does not replace a live socket', async () => {
    const info = serviceInfo(root);
    const listener = createServer((socket) => { socket.end('{"version":"old"}\n'); });
    await new Promise<void>((resolve) => listener.listen(info.socket, resolve));
    try {
      await expect(connectService(info)).rejects.toThrow('version mismatch');
      expect(await call(await client(), 'find_code', { query: 'normalize' })).toContain('normalize');
      expect(existsSync(info.socket)).toBe(true);
    } finally { await new Promise<void>((resolve) => listener.close(() => resolve())); }
  });
});

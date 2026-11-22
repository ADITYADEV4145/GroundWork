import { createServer, type Server, type Socket } from 'node:net';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardHook } from '../src/hooks/client.js';
import { serviceHook } from '../src/hooks/service.js';
import { serviceInfo } from '../src/mcp/relay.js';
import { tempDir } from '../src/selftest/fixtures.js';

describe.skipIf(process.platform === 'win32')('slim hook transport', () => {
  let root: string;
  let server: Server | undefined;
  const sockets = new Set<Socket>();
  beforeEach(() => {
    root = tempDir('gw-hook-client-');
    vi.stubEnv('GW_RUNTIME_DIR', path.join(root, 'run'));
  });
  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
  const input = (cwd: string) => JSON.stringify({ cwd, session_id: 'test', tool_name: 'Read', tool_input: { file_path: path.join(cwd, 'app.ts') } });
  async function listen(reply: (socket: Socket, version: string) => void) {
    const info = serviceInfo(root);
    server = createServer((socket) => { sockets.add(socket); reply(socket, info.version); });
    await new Promise<void>((resolve) => server!.listen(info.socket, resolve));
  }
  it('forwards intact payloads and returns a rendered result', async () => {
    await listen((socket, version) => {
      socket.write(JSON.stringify({ version }) + '\n');
      socket.on('data', (data) => {
        expect(JSON.parse(data.toString())).toMatchObject({ groundworkHook: 1, agent: 'claude', event: 'pre_tool', raw: JSON.parse(input(root)) });
        socket.end(JSON.stringify({ output: '{"hookSpecificOutput":{"permissionDecision":"deny"}}' }) + '\n');
      });
    });
    expect(await forwardHook('claude', 'pre_tool', input(root))).toContain('deny');
  });
  it('falls back only for absent services or a version mismatch', async () => {
    expect(await forwardHook('claude', 'pre_tool', input(root))).toBeNull();
    await listen((socket) => socket.end('{"version":"old"}\n'));
    expect(await forwardHook('claude', 'pre_tool', input(root))).toBeNull();
    expect(await forwardHook('claude', 'stop', input(root))).toBeNull();
  });
  it.each(['malformed', 'disconnect', 'timeout', 'invalid output'])('fails open for %s without replaying a request', async (mode) => {
    await listen((socket, version) => {
      socket.write(JSON.stringify({ version }) + '\n');
      socket.on('data', () => {
        if (mode === 'malformed') socket.end('not JSON\n');
        if (mode === 'disconnect') socket.destroy();
        if (mode === 'invalid output') socket.end('{"output":"not JSON"}\n');
      });
    });
    expect(await forwardHook('claude', 'pre_tool', input(root), 50)).toBe('');
  });
  it('allows malformed/empty input and rejects a non-socket endpoint', async () => {
    expect(await forwardHook('claude', 'pre_tool', '{')).toBe('');
    expect(await forwardHook('claude', 'pre_tool', 'null')).toBe('');
    expect(await forwardHook('claude', 'pre_tool', '')).toBeNull();
    writeFileSync(serviceInfo(root).socket, 'not a socket');
    expect(await forwardHook('claude', 'pre_tool', input(root))).toBe('');
  });
  it('refuses cross-repository and invalid dispatch envelopes', async () => {
    expect(await serviceHook(root, { agent: 'invalid', event: 'post_tool' })).toBe('');
    expect(await serviceHook(root, { agent: 'claude', event: 'pre_tool', raw: { cwd: path.dirname(root), tool_name: 'Read' } })).toBe('');
  });
});

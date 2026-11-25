import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from '../util/paths.js';
import { privateDirectory } from '../util/user-cache.js';
import { runtimeFingerprint } from './fingerprint.js';

export interface ServiceInfo { root: string; socket: string; version: string }

export function serviceInfo(root: string): ServiceInfo {
  if (process.platform === 'win32') throw new Error('Local sockets unavailable');
  root = realpathSync(root);
  const runtime = privateDirectory(process.env.GW_RUNTIME_DIR ?? path.join(tmpdir(), `groundwork-${process.getuid!()}`));
  const hash = createHash('sha256').update('groundwork-mcp-3').update(process.version).update(process.execPath);
  const code = fileURLToPath(new URL('../', import.meta.url));
  hash.update(runtimeFingerprint(code, fileURLToPath(new URL('../../package.json', import.meta.url)), runtime));
  hash.update(JSON.stringify(Object.entries(process.env).filter(([key]) => /^(GW_|HF_|TRANSFORMERS_)/.test(key) && !/^(GW_BENCH_|GW_HOOK_(?:TIMINGS|IN_PROCESS)$)/.test(key)).sort()));
  const version = hash.digest('hex');
  const key = version.slice(0, 24);
  const socket = path.join(runtime, key + '.sock');
  if (Buffer.byteLength(socket) > 100) throw new Error('Local socket path too long');
  return { root, socket, version };
}

function openService(info: ServiceInfo): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(info.socket);
    let greeting = Buffer.alloc(0);
    const fail = (error: Error) => { cleanup(); socket.destroy(); reject(error); };
    const timer = setTimeout(() => fail(new Error('Local MCP service handshake timed out')), 1000);
    const closed = () => fail(new Error('Local MCP service closed during handshake'));
    const data = (chunk: Buffer) => {
      greeting = Buffer.concat([greeting, chunk]);
      const end = greeting.indexOf(10);
      if (greeting.length > 4096) return fail(new Error('Invalid local MCP service greeting'));
      if (end < 0) return;
      try {
        if (JSON.parse(greeting.subarray(0, end).toString()).version !== info.version) throw new Error('Local MCP service version mismatch');
        socket.pause();
        cleanup();
        if (end + 1 < greeting.length) socket.unshift(greeting.subarray(end + 1));
        socket.write(JSON.stringify({ groundworkRoot: info.root }) + '\n');
        resolve(socket);
      } catch (error) { fail(error as Error); }
    };
    const cleanup = () => { clearTimeout(timer); socket.off('error', fail).off('close', closed).off('data', data); };
    socket.on('error', fail).on('close', closed).on('data', data);
  });
}

export async function connectService(info: ServiceInfo): Promise<Socket> {
  const lock = info.socket + '.lock', token = randomUUID();
  let owned = false, launched = false;
  const deadline = Date.now() + 2500;
  try {
    for (;;) {
      try { return await openService(info); }
      catch (error) {
        if (!['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      }
      if (Date.now() > deadline) throw new Error('Local MCP service startup timed out');
      if (!owned) {
        try { writeFileSync(lock, token, { flag: 'wx', mode: 0o600 }); owned = true; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          try {
            const st = lstatSync(lock);
            if (!st.isFile()) throw new Error('Invalid service lock');
            if (Date.now() - st.mtimeMs > 10000) unlinkSync(lock);
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
      }
      if (owned && !launched) {
        // Another starter may have finished before we acquired the lock.
        try { return await openService(info); }
        catch (error) {
          if (!['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        }
        try {
          const st = lstatSync(info.socket);
          if (!st.isSocket() || st.uid !== process.getuid!()) throw new Error('Invalid local MCP socket');
          unlinkSync(info.socket);
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        const entry = fileURLToPath(new URL('../cli/main.js', import.meta.url)).replace(/\.js$/, import.meta.url.endsWith('.ts') ? '.ts' : '.js');
        const loader = entry.endsWith('.ts') ? ['--import', import.meta.resolve('tsx')] : [];
        const child = spawn(process.execPath, [...loader, entry, '__mcp_service', info.root], { cwd: info.root, detached: true, stdio: 'ignore' });
        let startupError: Error | undefined;
        child.once('error', (error) => { startupError = error; });
        child.unref();
        await delay(1);
        if (startupError) throw startupError;
        launched = true;
      }
      await delay(launched ? 5 : 25);
    }
  } finally {
    if (owned) try { if (readFileSync(lock, 'utf8') === token) unlinkSync(lock); } catch { /* Already removed. */ }
  }
}

export interface ReplayState { initialize?: string; initialized: boolean; pending: Map<string, string>; partial: string }

export async function relaySession(socket: Socket): Promise<ReplayState | null> {
  const state: ReplayState = { initialized: false, pending: new Map(), partial: '' };
  return new Promise((resolve) => {
    let output = '', ended = false;
    const input = (chunk: Buffer) => {
      state.partial += chunk.toString('utf8');
      let end: number;
      while ((end = state.partial.indexOf('\n')) >= 0) {
        const line = state.partial.slice(0, end + 1);
        state.partial = state.partial.slice(end + 1);
        try {
          const message = JSON.parse(line);
          if (message.method === 'initialize') state.initialize = line;
          if (message.id !== undefined && message.method) state.pending.set(JSON.stringify(message.id), line);
          if (message.method === 'notifications/cancelled' && message.params?.requestId !== undefined)
            state.pending.delete(JSON.stringify(message.params.requestId));
        } catch { /* Let the MCP server handle malformed input. */ }
        socket.write(line);
      }
    };
    const data = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      let end: number;
      while ((end = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, end + 1);
        output = output.slice(end + 1);
        try {
          const message = JSON.parse(line);
          if (message.id !== undefined && !message.method) {
            const key = JSON.stringify(message.id);
            if (state.initialize && state.pending.get(key) === state.initialize) state.initialized = true;
            state.pending.delete(key);
          }
        } catch { socket.destroy(); return; }
        process.stdout.write(line);
      }
    };
    const end = () => { ended = true; socket.end(state.partial); };
    const done = () => {
      process.stdin.pause();
      process.stdin.off('data', input).off('end', end).off('error', end);
      socket.off('data', data).off('error', failed).off('close', done);
      resolve(ended ? null : state);
    };
    const failed = () => socket.destroy();
    process.stdin.setEncoding('utf8');
    socket.setEncoding('utf8');
    process.stdin.on('data', input).once('end', end).once('error', end);
    socket.on('data', data).once('error', failed).once('close', done);
    socket.resume();
    process.stdin.resume();
  });
}

export async function runMcp(root = findRepoRoot()): Promise<void> {
  let socket: Socket;
  try {
    if (process.env.GW_MCP_IN_PROCESS === '1') throw new Error('In-process mode');
    socket = await connectService(serviceInfo(root));
  } catch {
    const { startMcpServer } = await import('./server.js');
    await startMcpServer(root);
    return;
  }
  const replay = await relaySession(socket);
  if (replay) {
    const { resumeInProcess } = await import('./resume.js');
    await resumeInProcess(root, replay);
  }
}

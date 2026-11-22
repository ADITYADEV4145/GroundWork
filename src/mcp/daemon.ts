import { realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { serviceInfo } from './relay.js';
import { findRepoRoot } from '../util/paths.js';

export async function runService(root: string): Promise<void> {
  const info = serviceInfo(root);
  const peers = new Set<import('node:net').Socket>();
  const configured = Number(process.env.GW_MCP_IDLE_MS ?? 30000);
  const idleMs = Number.isFinite(configured) ? Math.max(100, Math.min(configured, 300000)) : 30000;
  let timer: NodeJS.Timeout;
  const idle = () => {
    clearTimeout(timer);
    if (!peers.size) timer = setTimeout(() => { listener.close(); }, idleMs);
  };
  const listener = createServer((socket) => {
    clearTimeout(timer);
    peers.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => { peers.delete(socket); idle(); });
    socket.write(JSON.stringify({ version: info.version, pid: process.pid }) + '\n');
    socket.once('end', () => socket.end());
    const handshake = setTimeout(() => socket.destroy(), 1000);
    socket.once('close', () => clearTimeout(handshake));
    let input = Buffer.alloc(0);
    const first = (chunk: Buffer) => {
      input = Buffer.concat([input, chunk]);
      if (input.length > 8 * 1024 * 1024) { socket.destroy(); return; }
      const end = input.indexOf(10);
      if (end < 0) return;
      clearTimeout(handshake);
      socket.pause();
      socket.off('data', first);
      let message: { groundworkRoot?: unknown; groundworkCwd?: unknown; groundworkHook?: number; agent?: unknown; event?: unknown; raw?: unknown } = {};
      let selected: string;
      try {
        message = JSON.parse(input.subarray(0, end).toString());
        if (typeof message?.groundworkRoot !== 'string' || message.groundworkRoot.length > 32768 || !path.isAbsolute(message.groundworkRoot)) throw new Error('Invalid workspace root');
        selected = realpathSync(message.groundworkRoot);
        if (!statSync(selected).isDirectory() || selected !== message.groundworkRoot || realpathSync(findRepoRoot(selected)) !== selected) throw new Error('Invalid workspace root');
      } catch {
        if (message?.groundworkHook === 1) socket.end(JSON.stringify({ fallback: true }) + '\n');
        else socket.destroy();
        return;
      }
      if (message.groundworkHook === 1) {
        void import('../hooks/service.js').then(({ serviceHook }) => serviceHook(selected, message)).then((output) => {
          if (!socket.destroyed) socket.end(JSON.stringify(output === null ? { fallback: true } : { output }) + '\n');
        }).catch(() => socket.destroy());
      } else {
        const remaining = input.subarray(end + 1);
        void createMcpServer(selected).then(async (server) => {
          if (socket.destroyed) { await server.close(); return; }
          socket.once('close', () => { void server.close(); });
          if (remaining.length) socket.unshift(remaining);
          await server.connect(new StdioServerTransport(socket, socket));
          socket.resume();
        }).catch(() => socket.destroy());
      }
    };
    socket.on('data', first);
  });
  listener.once('error', () => { clearTimeout(timer); });
  listener.once('close', () => { clearTimeout(timer); });
  listener.listen(info.socket, idle);
}

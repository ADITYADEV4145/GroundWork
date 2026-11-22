import { createServer } from 'node:net';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { serviceInfo } from './relay.js';

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
    void createMcpServer(info.root).then(async (server) => {
      if (socket.destroyed) { await server.close(); return; }
      socket.write(JSON.stringify({ version: info.version, pid: process.pid }) + '\n');
      socket.once('close', () => { void server.close(); });
      socket.once('end', () => socket.end());
      let input = Buffer.alloc(0);
      const first = (chunk: Buffer) => {
        input = Buffer.concat([input, chunk]);
        if (input.length > 8 * 1024 * 1024) { socket.destroy(); return; }
        const end = input.indexOf(10);
        if (end < 0) return;
        socket.pause();
        socket.off('data', first);
        let message: { groundworkHook?: number; agent?: unknown; event?: unknown; raw?: unknown };
        try { message = JSON.parse(input.subarray(0, end).toString()); }
        catch { socket.destroy(); return; }
        if (message?.groundworkHook === 1) {
          void import('../hooks/service.js').then(({ serviceHook }) => serviceHook(info.root, message)).then((output) => {
            if (!socket.destroyed) socket.end(JSON.stringify({ output }) + '\n');
          }).catch(() => socket.destroy());
        } else {
          socket.unshift(input);
          void server.connect(new StdioServerTransport(socket, socket)).then(() => socket.resume()).catch(() => socket.destroy());
        }
      };
      socket.on('data', first);
    }).catch(() => socket.destroy());
  });
  listener.once('error', () => { clearTimeout(timer); });
  listener.once('close', () => { clearTimeout(timer); });
  listener.listen(info.socket, idle);
}

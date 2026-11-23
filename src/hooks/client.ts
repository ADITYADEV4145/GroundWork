import { lstatSync, realpathSync } from 'node:fs';
import { connect } from 'node:net';
import { serviceInfo } from '../mcp/relay.js';
import { findRepoRoot } from '../util/paths.js';
import type { AgentName, HookEventName } from './types.js';

const MAX_INPUT = 8 * 1024 * 1024;

export async function readHookInput(): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.pause();
      process.stdin.off('data', data).off('end', end).off('error', fail);
    };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_INPUT) fail(new Error('Hook input too large'));
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')); };
    const timer = setTimeout(() => fail(new Error('Hook input timed out')), 1000);
    process.stdin.on('data', data).once('end', end).once('error', fail);
  });
}

export async function forwardHook(agent: AgentName, event: HookEventName, input: string, timeoutMs = 300): Promise<string | null> {
  if (process.env.GW_HOOK_IN_PROCESS === '1' || process.platform === 'win32') return null;
  try {
    const raw = input.trim() ? JSON.parse(input) : {};
    if (!raw || typeof raw !== 'object') return '';
    const stop = event === 'stop';
    // Stop runs in the service so its type checker and index stay warm between turns; a service failure reruns it in-process, never skips it.
    if (!stop && (!['pre_tool', 'post_tool'].includes(event) || !/^(Read|Edit|Write|MultiEdit|Delete|mcp__(?:plugin_groundwork_)?groundwork__find_code|MCP:find_code)$/.test(raw.tool_name ?? ''))) return null;
    const failed = stop ? null : '';
    let cwd: string, info: ReturnType<typeof serviceInfo>;
    try {
      cwd = realpathSync(typeof raw.cwd === 'string' ? raw.cwd :
        Array.isArray(raw.workspace_roots) && typeof raw.workspace_roots[0] === 'string' ? raw.workspace_roots[0] :
          process.env.CURSOR_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
      info = serviceInfo(findRepoRoot(cwd));
    } catch { return null; }
    try {
      const st = lstatSync(info.socket);
      if (!st.isSocket() || st.uid !== process.getuid!()) return failed;
    } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : failed; }
    return await new Promise((resolve) => {
      let buffer = '', greeted = false, done = false;
      const socket = connect(info.socket);
      const finish = (output: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(output);
      };
      const timer = setTimeout(() => finish(failed), stop ? Math.max(timeoutMs, 30_000) : timeoutMs);
      socket.setEncoding('utf8');
      socket.on('error', (error: NodeJS.ErrnoException) => finish(!greeted && ['ENOENT', 'ECONNREFUSED'].includes(error.code ?? '') ? null : failed));
      socket.on('close', () => finish(failed));
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer) > (greeted ? 256 * 1024 : 4096)) return finish(failed);
        const end = buffer.indexOf('\n');
        if (end < 0) return;
        try {
          const value = JSON.parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          if (!greeted) {
            if (value.version !== info.version) return finish(null);
            greeted = true;
            socket.write(JSON.stringify({ groundworkRoot: info.root, groundworkCwd: cwd, groundworkHook: 1, agent, event, raw }) + '\n');
          } else {
            if (value.fallback === true) return finish(null);
            if (typeof value.output !== 'string') return finish(failed);
            if (value.output && (!JSON.parse(value.output) || typeof JSON.parse(value.output) !== 'object')) return finish(failed);
            finish(value.output);
          }
        } catch { finish(failed); }
      });
    });
  } catch { return ''; }
}

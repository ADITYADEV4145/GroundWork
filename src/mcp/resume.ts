import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { createMcpServer } from './server.js';
import type { ReplayState } from './relay.js';

export async function resumeInProcess(root: string, state: ReplayState): Promise<void> {
  const input = new PassThrough(), output = new PassThrough(), buffer = new ReadBuffer();
  const initialize = state.initialize ? JSON.parse(state.initialize) : undefined;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  output.on('data', (chunk: Buffer) => {
    buffer.append(chunk);
    for (let message; (message = buffer.readMessage()) !== null;) {
      if (initialize && 'id' in message && message.id === initialize.id) {
        if (!state.initialized) process.stdout.write(serializeMessage(message));
        release!();
      } else process.stdout.write(serializeMessage(message));
    }
  });
  const server = await createMcpServer(root);
  await server.connect(new StdioServerTransport(input, output));
  if (state.initialize) {
    input.write(state.initialize);
    await ready;
    if (state.initialized) input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  }
  for (const line of state.pending.values()) if (line !== state.initialize) input.write(line);
  input.write(state.partial);
  process.stdin.once('end', () => { void server.close(); });
  process.stdin.pipe(input);
  process.stdin.resume();
}

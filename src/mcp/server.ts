import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../config/load.js';
import { experimentalReadPathsEnabled } from '../config/sections/navigation.js';
import { indexDbPath } from '../index/store.js';
import { initSqlBackend, openDb } from '../store/db.js';
import { log } from '../util/log.js';
import { VERSION } from '../util/version.js';
import { TOOLS } from './tools/index.js';

export async function createMcpServer(root: string): Promise<McpServer> {
  await initSqlBackend();
  const server = new McpServer({ name: 'groundwork', version: VERSION });
  let experimental = false;
  try { experimental = experimentalReadPathsEnabled(loadConfig(root)); } catch { /* invalid config is reported by tool calls */ }
  for (const tool of TOOLS) {
    const description = tool.name === 'explore' && experimental ? 'Experimental read paths enabled: start trace questions here. ' + tool.description : tool.description;
    server.registerTool(tool.name, { description, inputSchema: tool.inputSchema }, async (args: Record<string, unknown>) => {
      try {
        const config = loadConfig(root);
        if (!tool.noRefresh) {
          const { refreshIndex } = await import('../index/refresh.js');
          await refreshIndex(root, { config });
        }
        const db = openDb(indexDbPath(root), { readonly: true });
        try {
          const text = await tool.handler(args as never, { root, config, db });
          return { content: [{ type: 'text' as const, text }] };
        } finally {
          db.close();
        }
      } catch (e) {
        log(root, 'error', 'mcp_tool_failed', { tool: tool.name, error: (e as Error).message });
        return { content: [{ type: 'text' as const, text: `groundwork error: ${(e as Error).message}` }], isError: true };
      }
    });
  }
  return server;
}

export async function startMcpServer(root: string): Promise<void> {
  const server = await createMcpServer(root);
  const transport = new StdioServerTransport();
  process.stdin.once('end', () => { void server.close(); });
  await server.connect(transport);
}

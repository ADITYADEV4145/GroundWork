import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const server = new McpServer({ name: 'h2h-fake', version: '1.0.0' });
server.registerTool('echo', {}, async () => ({ content: [{ type: 'text', text: 'hello' }] }));
server.registerTool('empty', {}, async () => ({ content: [] }));
server.registerTool('fail', {}, async () => ({ content: [{ type: 'text', text: 'failed' }], isError: true }));
await server.connect(new StdioServerTransport());

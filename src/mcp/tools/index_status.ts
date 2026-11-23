import { indexStats } from '../../index/query.js';
import { defineTool } from '../registry.js';

export const indexStatusTool = defineTool({
  name: 'index_status',
  description: 'Index size and health: files, symbols and edge resolution.',
  inputSchema: {},
  handler(_args, { db }) {
    const s = indexStats(db);
    return `files ${s.files}, symbols ${s.symbols}, imports resolved ${s.importsResolved}/${s.importsInternal} internal, calls ${s.calls}`;
  },
});

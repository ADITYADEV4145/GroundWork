import { indexStats } from '../../index/query.js';
import { defineTool } from '../registry.js';

export const indexStatusTool = defineTool({
  name: 'index_status',
  description: 'Size and health of the Groundwork code index for this repo (files, symbols, import/call resolution).',
  inputSchema: {},
  handler(_args, { db }) {
    const s = indexStats(db);
    return `files ${s.files}, symbols ${s.symbols}, imports resolved ${s.importsResolved}/${s.importsInternal} internal, calls ${s.calls}`;
  },
});

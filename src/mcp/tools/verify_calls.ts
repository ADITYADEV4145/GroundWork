import path from 'node:path';
import { z } from 'zod';
import { parseLineSpec, renderResults, verifyChanged } from '../../grounding/index.js';
import { toPosix } from '../../util/paths.js';
import { defineTool } from '../registry.js';

export const verifyCallsTool = defineTool({
  name: 'verify_calls',
  description:
    'Check a file you edited against the index: imports of names that do not exist, calls to unknown repo functions/members, wrong argument counts and unknown keywords. Each finding names the nearest real symbols with signature and location.',
  inputSchema: {
    file: z.string().describe('path of the file, relative to the repo root'),
    lines: z.string().optional().describe('only these lines, e.g. "10-40,52"'),
  },
  handler({ file, lines }, { root, db, config }) {
    const rel = toPosix(path.relative(root, path.resolve(root, file)));
    const [res] = verifyChanged(db, root, [{ file: rel, ranges: lines ? parseLineSpec(lines) : null }], config);
    return renderResults([res!], config.grounding.budgetTokens * 2, { showUnchecked: true, showClean: true });
  },
});

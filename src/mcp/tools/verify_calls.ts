import path from 'node:path';
import { z } from 'zod';
import { toPosix } from '../../util/paths.js';
import { defineTool } from '../registry.js';

export const verifyCallsTool = defineTool({
  name: 'verify_calls',
  description:
    'Once per task, check all new cross-file calls in one request using files: [{file, lines?}]. Checks imports, repo functions/members, argument counts and keywords; findings name real symbols. A single file is also accepted. Clean: ok.',
  inputSchema: {
    file: z.string().min(1).optional().describe('single file, relative to the repo root'),
    lines: z.string().optional().describe('only these lines, e.g. "10-40,52"'),
    files: z.array(z.object({ file: z.string().min(1), lines: z.string().optional() }).strict()).min(1).max(100).optional().describe('all edited files/ranges to check together'),
  },
  async handler({ file, lines, files }, { root, db, config }) {
    if ((!file && !files?.length) || (files && (file || lines))) throw new Error('Provide file with optional lines, or files: [{file, lines?}].');
    const { parseLineSpec, renderResults, verifyChanged } = await import('../../grounding/index.js');
    const changed = (files ?? [{ file: file!, lines }]).map((item) => ({
      file: toPosix(path.relative(root, path.resolve(root, item.file))),
      ranges: item.lines ? parseLineSpec(item.lines) : null,
    }));
    const results = verifyChanged(db, root, changed, config);
    return renderResults(results, config.grounding.budgetTokens * 2, { showUnchecked: true }) || 'ok';
  },
});

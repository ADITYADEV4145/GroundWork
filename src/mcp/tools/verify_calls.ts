import path from 'node:path';
import { z } from 'zod';
import { toPosix } from '../../util/paths.js';
import { defineTool } from '../registry.js';

export const verifyCallsTool = defineTool({
  name: 'verify_calls',
  description:
    'Check unconfirmed cross-file calls/imports after edits, at most once per task: one batched call instead of rereads. Never re-read to verify. Pass file with optional lines, or files. Clean: ok.',
  inputSchema: {
    file: z.string().min(1).optional().describe('Repo-relative path.'),
    lines: z.string().optional().describe('Ranges, e.g. "10-40,52".'),
    files: z.array(z.object({ file: z.string().min(1), lines: z.string().optional() }).strict()).min(1).max(100).optional(),
  },
  async handler({ file, lines, files }, { root, db, config }) {
    if ((!file && !files?.length) || (files && (file || lines))) throw new Error('Provide file with optional lines, or files: [{file, lines?}].');
    const { parseLineSpec, renderResults, verifyChangedDeep } = await import('../../grounding/index.js');
    const changed = (files ?? [{ file: file!, lines }]).map((item) => ({
      file: toPosix(path.relative(root, path.resolve(root, item.file))),
      ranges: item.lines ? parseLineSpec(item.lines) : null,
    }));
    const results = await verifyChangedDeep(db, root, changed, config);
    return renderResults(results, config.grounding.budgetTokens * 2, { showUnchecked: true }) || 'ok';
  },
});

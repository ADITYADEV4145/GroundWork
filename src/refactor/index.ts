import { createHash } from 'node:crypto';
import type { ToolContext } from '../mcp/registry.js';
import { formatCheck } from '../reuse/check.js';
import { fitToBudget } from '../util/tokens.js';
import { applyPatch, guardCandidate } from './guard.js';
import { planEdits, readEditable, type RefactorRequest } from './project.js';

export { MAX_BODY } from './project.js';

export async function refactorSymbol(ctx: ToolContext, request: RefactorRequest, expected?: string) {
  const { target, edits } = planEdits(ctx, request);
  const id = createHash('sha256').update(JSON.stringify([request, edits.map(({ file, before, after }) => [file, before, after])])).digest('hex');
  if (expected !== undefined && expected !== id) throw new Error('Preview no longer matches. Generate a new preview.');
  const { patch, check, assertCurrent } = await guardCandidate(ctx, edits);
  const applied = expected !== undefined && !check.blocked;
  if (applied) {
    assertCurrent();
    if (edits.some((e) => readEditable(ctx, e.file) !== e.before)) throw new Error('Files changed during validation. Nothing applied.');
    applyPatch(ctx.root, patch);
  }
  return {
    id, applied, patch, check,
    symbol: { id: target.id, file: target.file, name: target.qualifiedName },
    files: edits.map((e) => ({ file: e.file, edits: e.edits.length })),
  };
}

export type RefactorResult = Awaited<ReturnType<typeof refactorSymbol>>;

export function formatRefactor(result: RefactorResult): string {
  const { id, files, applied, check } = result;
  const status = check.blocked ? 'Blocked; no files changed' : applied ? 'Applied' : 'Ready to apply; no files changed';
  const render = (file: typeof files[number]) => `${JSON.stringify(file.file)}: ${file.edits} edit(s)`;
  const { items, truncated } = fitToBudget(files, render, 200);
  return [
    `${status} (${files.length} file(s)).`, `Preview ID: ${id}`,
    ...items.map(render), ...(truncated ? [`… ${truncated} more; use --json for the full preview.`] : []),
    ...(check.findings.length ? [formatCheck(check)] : []),
  ].join('\n');
}

import type { GroundworkConfig } from '../config/schema.js';
import type { Db } from '../store/db.js';
import { fitToBudget } from '../util/tokens.js';
import { changedFromGit, type ChangedFile } from './ranges.js';
import { Grounder, type Finding, type VerifyResult } from './verify.js';

export { Grounder, verifyFile, type Finding, type FindingKind, type LineRange, type VerifyResult } from './verify.js';
export { changedFromGit, changedFromToolInput, parseLineSpec, type ChangedFile } from './ranges.js';

export function verifyChanged(db: Db, root: string, changed: ChangedFile[], config?: GroundworkConfig): VerifyResult[] {
  const g = new Grounder(db, root);
  return changed.map((c) => g.verify(c.file, { ranges: c.ranges, ...(config ? { config } : {}) }));
}

/** Grounding part of `gw check` / the Stop gate: definite errors on lines changed since `base`. */
export function groundingGate(db: Db, root: string, opts: { base?: string; config?: GroundworkConfig } = {}): { blocking: Finding[]; findings: Finding[] } {
  const findings = verifyChanged(db, root, changedFromGit(root, opts.base), opts.config).flatMap((r) => r.findings);
  return { findings, blocking: findings.filter((f) => f.blocking) };
}

export function renderFinding(f: Finding): string {
  return `${f.file}:${f.line} ${f.kind}: ${f.message}`;
}

/** Compact, budgeted report. `unchecked` files are listed only when asked (the hook stays silent about them). */
export function renderResults(results: VerifyResult[], budgetTokens: number, opts: { header?: string; showUnchecked?: boolean; showClean?: boolean } = {}): string {
  const findings = results.flatMap((r) => r.findings);
  const lines: string[] = [];
  if (findings.length) {
    if (opts.header) lines.push(opts.header.replace('{n}', String(findings.length)));
    const fit = fitToBudget(findings, renderFinding, budgetTokens);
    lines.push(...fit.items.map(renderFinding));
    if (fit.truncated) lines.push(`… ${fit.truncated} more (gw verify <file> --json)`);
  }
  if (opts.showUnchecked) for (const r of results) if (r.unchecked) lines.push(`${r.file}: not checked (${r.unchecked})`);
  if (!lines.length && opts.showClean) lines.push(`no grounding issues in ${results.length} file${results.length === 1 ? '' : 's'}`);
  return lines.join('\n');
}

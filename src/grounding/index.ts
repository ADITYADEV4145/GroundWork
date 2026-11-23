import type { GroundworkConfig } from '../config/schema.js';
import type { Db } from '../store/db.js';
import { estimateTokens } from '../util/tokens.js';
import { changedFromGit, type ChangedFile } from './ranges.js';
import { Grounder, type Finding, type VerifyResult } from './verify.js';

export { Grounder, verifyFile, type Finding, type FindingKind, type LineRange, type VerifyResult } from './verify.js';
export { changedFromGit, changedFromToolInput, parseLineSpec, type ChangedFile } from './ranges.js';

export function verifyChanged(db: Db, root: string, changed: ChangedFile[], config?: GroundworkConfig): VerifyResult[] {
  const g = new Grounder(db, root);
  return changed.map((c) => g.verify(c.file, { ranges: c.ranges, ...(config ? { config } : {}) }));
}

/**
 * `verifyChanged` plus checking beyond the repo: installed dependencies, sibling workspace packages and local
 * service contracts. Fails open: any error in the dependency pass leaves the in-repo result untouched.
 */
export async function verifyChangedDeep(db: Db, root: string, changed: ChangedFile[], config?: GroundworkConfig): Promise<VerifyResult[]> {
  const results = verifyChanged(db, root, changed, config);
  if (config && !config.deps.enabled) return results;
  try {
    const { DependencyChecker } = await import('../deps/check.js');
    const { checkContracts } = await import('../deps/contracts.js');
    const checker = new DependencyChecker(db, root, config);
    for (let i = 0; i < changed.length; i++) {
      const r = results[i]!;
      // In-repo grounding skips some files entirely (excluded, generated); those stay skipped here too.
      if (r.unchecked && r.unchecked !== 'unsupported language') continue;
      const dep = await checker.check(changed[i]!.file, changed[i]!.ranges);
      const contract = config?.deps.contracts === false ? [] : checkContracts(root, changed[i]!.file, changed[i]!.ranges);
      if (dep.checked && r.unchecked === 'unsupported language') r.unchecked = null;
      const seen = new Set(r.findings.map((f) => `${f.line}:${f.kind}:${f.name}`));
      for (const f of [...dep.findings, ...contract]) if (!seen.has(`${f.line}:${f.kind}:${f.name}`)) r.findings.push(f);
      r.findings.sort((a, b) => a.line - b.line);
    }
  } catch {
    // dependency checking is additive
  }
  return results;
}

/** Grounding part of `gw check` / the Stop gate: definite errors on lines changed since `base`. */
export async function groundingGate(db: Db, root: string, opts: { base?: string; config?: GroundworkConfig } = {}): Promise<{ blocking: Finding[]; findings: Finding[] }> {
  const findings = (await verifyChangedDeep(db, root, changedFromGit(root, opts.base), opts.config)).flatMap((r) => r.findings);
  return { findings, blocking: findings.filter((f) => f.blocking) };
}

export function renderFinding(f: Finding): string {
  return `${f.file}:${f.line} ${f.kind}: ${f.message}`;
}

/** Compact, budgeted report. `unchecked` files are listed only when asked (the hook stays silent about them). */
export function renderResults(results: VerifyResult[], budgetTokens: number, opts: { header?: string; showUnchecked?: boolean; showClean?: boolean } = {}): string {
  const findings = results.flatMap((r) => r.findings);
  const unchecked = opts.showUnchecked ? results.filter((r) => r.unchecked) : [];
  if (!findings.length && !unchecked.length) return opts.showClean ? `no grounding issues in ${results.length} file${results.length === 1 ? '' : 's'}` : '';
  let header = findings.length ? opts.header?.replace('{n}', String(findings.length)) : undefined;
  const render = (keptFindings: number, keptUnchecked: number) => [
    ...(header ? [header] : []),
    ...findings.slice(0, keptFindings).map(renderFinding),
    ...(keptFindings < findings.length ? [`… ${findings.length - keptFindings} more (gw verify <file> --json)`] : []),
    ...unchecked.slice(0, keptUnchecked).map((r) => `${r.file}: not checked (${r.unchecked})`),
    ...(keptUnchecked < unchecked.length ? [`+${unchecked.length - keptUnchecked} more unchecked`] : []),
  ].join('\n');
  if (estimateTokens(render(0, 0)) > budgetTokens) header = undefined;
  if (estimateTokens(render(0, 0)) > budgetTokens) return budgetTokens >= 1 ? '…' : '';
  let keptFindings = 0, keptUnchecked = 0;
  while (keptFindings < findings.length && estimateTokens(render(keptFindings + 1, 0)) <= budgetTokens) keptFindings++;
  while (keptUnchecked < unchecked.length && estimateTokens(render(keptFindings, keptUnchecked + 1)) <= budgetTokens) keptUnchecked++;
  return render(keptFindings, keptUnchecked);
}

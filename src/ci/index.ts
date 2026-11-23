import { execFileSync } from 'node:child_process';
import picomatch from 'picomatch';
import type { GroundworkConfig } from '../config/schema.js';
import { changedFromGit } from '../grounding/index.js';
import { SCAN_KINDS, scanRepository, toSarif, type ScanFinding, type ScanKind, type ScanReport } from '../scan/index.js';
import type { Db } from '../store/db.js';

export type Severity = 'block' | 'warn' | 'off';
export interface CheckResult {
  conclusion: 'pass' | 'fail' | 'skipped';
  /** Why the pull request was skipped, or what marks it as agent-written. */
  reason: string | null;
  blocking: ScanFinding[];
  warnings: ScanFinding[];
  /** Low-confidence findings: counted, never shown in the comment and never failing. */
  lowConfidence: number;
  files: number;
  skipped: string[];
  ms: number;
}

export interface PullRequest {
  number: number | null;
  base: string | null;
  head: string | null;
  author: string;
  authorIsBot: boolean;
  labels: string[];
}

/** The pull request fields of a GitHub `pull_request` event payload. */
export function readEvent(payload: unknown): PullRequest | null {
  const pr = (payload as { pull_request?: Record<string, any> } | null)?.pull_request;
  if (!pr) return null;
  return {
    number: typeof pr.number === 'number' ? pr.number : null,
    base: pr.base?.sha ?? null, head: pr.head?.sha ?? null,
    author: String(pr.user?.login ?? ''), authorIsBot: pr.user?.type === 'Bot',
    labels: Array.isArray(pr.labels) ? pr.labels.map((l: { name?: string }) => String(l.name ?? '')) : [],
  };
}

const AGENT = /(?<![a-z])(devin|copilot|claude|codex|cursor|aider|gemini|jules|openhands|sweep|codegen|amazon q)(?![a-z])/i;
/** Bots that open pull requests without writing code with a model. */
const NOT_AGENT = /^(dependabot|renovate|github-actions|mergify|snyk|greenkeeper|pre-commit-ci)(\[bot\])?$/i;

/** Author names, emails and message bodies of the commits a pull request adds. Empty when git cannot say. */
export function commitTexts(root: string, base: string, head = 'HEAD'): string[] {
  try {
    return execFileSync('git', ['log', '--format=%an <%ae>%n%B%x00', `${base}..${head}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 })
      .toString().split('\0').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

/** What marks a pull request as agent-written (a label, a bot author, a commit author or co-author trailer), or null. */
export function detectAi(pr: Pick<PullRequest, 'author' | 'authorIsBot' | 'labels'>, commits: string[], aiLabels: string[]): string | null {
  const wanted = new Set(aiLabels.map((l) => l.toLowerCase()));
  const label = pr.labels.find((l) => wanted.has(l.toLowerCase()));
  if (label) return `label ${label}`;
  if (pr.author && !NOT_AGENT.test(pr.author) && (pr.authorIsBot || AGENT.test(pr.author))) return `author ${pr.author}`;
  for (const commit of commits) {
    const [author = '', ...body] = commit.split('\n');
    if (AGENT.test(author)) return `commit author ${author}`;
    const trailer = body.find((l) => /^(co-authored-by|generated-by|assisted-by):/i.test(l.trim()) && AGENT.test(l))
      ?? body.find((l) => /generated (with|by)/i.test(l) && AGENT.test(l));
    if (trailer) return `commit trailer ${trailer.trim().slice(0, 80)}`;
  }
  return null;
}

/** The commit a pull request branched from, so only what the pull request itself changed is scanned. */
export function mergeBase(root: string, base: string): string {
  try {
    return execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || base;
  } catch { return base; }
}

export interface CheckOptions { config: GroundworkConfig; base: string; severity?: Partial<Record<ScanKind, Severity>>; ignore?: string[] }

/** Scan what changed since `base` and sort the findings into blocking and warnings by the configured severities. */
export async function runCheck(db: Db, root: string, options: CheckOptions): Promise<CheckResult & { report: ScanReport }> {
  const { config } = options;
  const severity = { ...config.ci.severity, ...options.severity };
  const ignored = picomatch([...config.ci.ignore, ...(options.ignore ?? [])], { dot: true });
  const keep = (f: ScanFinding) => severity[f.kind] !== 'off' && !ignored(f.file);
  const changed = changedFromGit(root, options.base);
  const empty = { reason: null, blocking: [], warnings: [], lowConfidence: 0 };
  if (!changed.length) {
    const report: ScanReport = { mode: 'diff', files: 0, filesUnchecked: 0, counts: Object.fromEntries(SCAN_KINDS.map((k) => [k, 0])) as Record<ScanKind, number>, findings: [], check: [], skipped: [], ms: 0 };
    return { conclusion: 'pass', ...empty, files: 0, skipped: [], ms: 0, report };
  }
  const report = await scanRepository(db, root, { config, changed, base: options.base });
  const findings = report.findings.filter(keep);
  // Never block on uncertainty: only a high-confidence finding of a blocking kind fails the check.
  const blocks = (f: ScanFinding) => severity[f.kind] === 'block' && f.confidence === 'high';
  const blocking = findings.filter(blocks);
  return {
    conclusion: blocking.length ? 'fail' : 'pass', reason: null, blocking, warnings: findings.filter((f) => !blocks(f)),
    lowConfidence: report.check.filter(keep).length, files: report.files, skipped: report.skipped, ms: report.ms,
    report: { ...report, findings, check: [] },
  };
}

export const COMMENT_MARKER = '<!-- groundwork-check -->';
const LABEL: Record<ScanKind, string> = {
  'invented-call': 'Invented calls', 'wrong-arguments': 'Wrong arguments', 'duplicate-logic': 'Duplicated logic',
  'duplicate-constant': 'Duplicate constants', 'dead-code': 'Dead code', 'type-error': 'Type errors',
};
/** Finding text comes from the checked code: keep it from opening markup, code spans or mentions in the comment. */
const md = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, "'").replace(/@/g, '@\u200b').replace(/([\\*_[\]|~])/g, '\\$1');
const code = (s: string) => `\`${s.replace(/[\x00-\x1f\x7f`]/g, ' ')}\``;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The one pull request comment: findings grouped by kind, blocking first, at most `max`. Null when there is nothing to say. */
export function renderComment(result: CheckResult, max = 10): string | null {
  const total = result.blocking.length + result.warnings.length;
  if (result.conclusion === 'skipped' || !total) return null;
  const out = [COMMENT_MARKER, `### GroundWork check: ${[result.blocking.length ? `${result.blocking.length} blocking` : '', result.warnings.length ? plural(result.warnings.length, 'warning') : ''].filter(Boolean).join(', ')}`];
  let left = max;
  for (const [title, list] of [['Blocking', result.blocking], ['Warnings', result.warnings]] as const) {
    const shown = list.slice(0, left);
    left -= shown.length;
    if (!shown.length) continue;
    out.push('', `**${title}**`);
    for (const kind of SCAN_KINDS) {
      const group = shown.filter((f) => f.kind === kind);
      if (!group.length) continue;
      out.push('', `${LABEL[kind]}:`);
      for (const f of group) out.push(`- ${code(`${f.file}:${f.line}`)} ${md(f.message)}${f.suggestion ? ` Use ${code(f.suggestion)}.` : ''}`);
    }
  }
  if (total > max) out.push('', `${total - max} more not shown; the run log and code scanning list every finding.`);
  const notes = [`Checked ${plural(result.files, 'changed file')} in the runner; no code left CI.`];
  if (result.skipped.length) notes.push(`Not checked: ${result.skipped.map(md).join('; ')}.`);
  out.push('', `<sub>${notes.join(' ')}</sub>`);
  return out.join('\n') + '\n';
}

/** Plain text for the run log and the job summary. */
export function renderSummary(result: CheckResult): string {
  if (result.conclusion === 'skipped') return `GroundWork check: skipped (${result.reason ?? 'nothing to check'})`;
  const head = `GroundWork check: ${result.conclusion === 'fail' ? 'failed' : 'passed'}, ${result.blocking.length} blocking, ${plural(result.warnings.length, 'warning')}, ${plural(result.files, 'changed file')} checked in ${(result.ms / 1000).toFixed(1)}s`;
  const line = (tag: string) => (f: ScanFinding) => `  ${tag} ${f.file}:${f.line}  ${f.message.replace(/[\x00-\x1f\x7f]/g, ' ')}${f.suggestion ? `  -> ${f.suggestion.replace(/[\x00-\x1f\x7f]/g, ' ')}` : ''}`;
  const out = [head, ...result.blocking.map(line('block')), ...result.warnings.map(line('warn '))];
  if (result.lowConfidence) out.push(`  ${plural(result.lowConfidence, 'low-confidence finding')} not reported (gw scan --base lists them)`);
  if (result.skipped.length) out.push('Not checked:', ...result.skipped.map((s) => `  ${s}`));
  return out.join('\n');
}

/** SARIF for code scanning: blocking findings as errors, everything else reported as warnings. */
export function checkSarif(result: CheckResult & { report: ScanReport }): unknown {
  const sarif = toSarif(result.report) as { runs: { results: { level: string }[] }[] };
  const blocking = new Set(result.blocking);
  sarif.runs[0]!.results.forEach((r, i) => { r.level = blocking.has(result.report.findings[i]!) ? 'error' : 'warning'; });
  return sarif;
}

/** `owner/repo` from a GitHub remote URL (https, ssh, or behind a proxy path). */
export function repoSlug(remote: string): string | null {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** README badge that shows the workflow's latest result and links to its runs. */
export function badgeMarkdown(slug: string, workflow = 'groundwork.yml'): string {
  const url = `https://github.com/${slug}/actions/workflows/${workflow}`;
  return `[![agent-checked](${url}/badge.svg)](${url})`;
}

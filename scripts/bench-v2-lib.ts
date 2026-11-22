import path from 'node:path';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import type { CheckFinding } from '../src/reuse/check.js';
import { BLOCK_REVIEW_POLICY, resolutionDetail, summarizeBlockReview } from '../src/selftest/real-repo-review.js';
import type { ReviewScoring } from '../src/selftest/real-repo-review.js';
import { shellQuote } from '../src/guards/trimmer.js';

export type Arm = 'baseline' | 'groundwork';
export type Label = 'reused' | 'duplicate' | 'unknown';
export type Suite = 'reuse-v2' | 'block-v2';
export interface BlockTask {
  id: string; repo: string; url: string; commit: string; prompt: string;
  kind: 'clone-prone' | 'hard-negative'; reference_symbol: { file: string; name: string }; why: string;
  wave?: 3 | 4 | 5 | 6;
  copy_inviting?: true;
  vendoring?: boolean;
}
export interface Task {
  id: string; repo: string; url: string; commit: string; prompt: string;
  helpers: { file: string; name: string }[];
  acceptance: { path: string; contents: string; command: string };
  reference_patch: string;
}
export interface Run {
  task_id: string; arm: Arm; patch: string; decisions: string[]; notes: string;
  session_id: string; acus: number | null;
}
export interface Override { task_id: string; arm: Arm; label: Label; reviewer: string; reasoning: string }
export interface ReuseLabel { label: Label; reason: string; source: 'automated' | 'human' }
export interface Result {
  suite?: Suite; task_kind?: BlockTask['kind'];
  task_id: string; arm: Arm; session_id: string; acus: number | null;
  status: 'scored' | 'apply_failed' | 'execution_failed'; success: boolean | null;
  acceptance: { exitCode: number | null; output: string } | null;
  check: { status: string; findings: CheckFinding[]; error?: string };
  reuse: ReuseLabel; error?: string;
}
export interface Interval { low: number; high: number }

export function wilson(count: number, n: number): Interval | null {
  if (!Number.isInteger(count) || !Number.isInteger(n) || count < 0 || n < count) throw new Error('Invalid binomial counts');
  if (!n) return null;
  const z = 1.959963984540054, p = count / n, denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

// Newcombe's independent-proportions hybrid score interval (method 10).
export function newcombe(a: number, na: number, b: number, nb: number): Interval | null {
  const wa = wilson(a, na), wb = wilson(b, nb);
  if (!wa || !wb) return null;
  const pa = a / na, pb = b / nb, difference = pa - pb;
  return {
    low: Math.max(-1, difference - Math.hypot(pa - wa.low, wb.high - pb)),
    high: Math.min(1, difference + Math.hypot(wa.high - pa, pb - wb.low)),
  };
}

export interface AddedFile { file: string; source: string; addedLines: Set<number> }
export function pythonAcceptanceCommand(command: string, python: string): string {
  return `python() { ${shellQuote(python)} "$@"; }\n${command}`;
}
export function addedLines(patch: string): Map<string, Set<number>> {
  const files = new Map<string, Set<number>>();
  let current: Set<number> | undefined, line = 0;
  for (const text of patch.split('\n')) {
    if (text.startsWith('diff --git ')) current = undefined;
    if (text.startsWith('+++ b/')) {
      current = new Set(); files.set(text.slice(6), current);
    } else if (text.startsWith('@@ ')) {
      const match = /\+(\d+)/.exec(text);
      line = Number(match?.[1]);
    } else if (current && text.startsWith('+') && !text.startsWith('+++')) {
      current.add(line++);
    } else if (current && text.startsWith(' ')) line++;
  }
  return files;
}

function moduleFile(file: string, specifier: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)).replace(/\.(?:[cm]?[jt]sx?)$/, '');
}

function typescriptReuse(task: Task, file: AddedFile): string | undefined {
  const ast = ts.createSourceFile(file.file, file.source, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, string>();
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause || statement.importClause.isTypeOnly) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith('.')) continue;
    for (const helper of task.helpers) {
      if (moduleFile(file.file, specifier) !== helper.file.replace(/\.[^.]+$/, '')) continue;
      const clause = statement.importClause;
      if (clause.name) bindings.set(clause.name.text, helper.name);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const item of clause.namedBindings.elements) {
          if (!item.isTypeOnly && (item.propertyName ?? item.name).text === helper.name) bindings.set(item.name.text, helper.name);
        }
      }
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bindings.set(`${clause.namedBindings.name.text}.${helper.name}`, helper.name);
    }
  }
  let found: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      const callee = node.expression.getText(ast);
      const local = task.helpers.find(h => h.file === file.file && h.name === callee);
      if (file.addedLines.has(line) && (bindings.has(callee) || local)) found = bindings.get(callee) ?? local?.name;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
}

const pythonReuse = String.raw`
import ast, json, sys
data = json.load(sys.stdin)
file = data['file']
try:
    tree = ast.parse(file['source'])
except SyntaxError:
    print(''); sys.exit(0)
parts = file['file'].removesuffix('.py').split('/')
if parts[0] == 'src': parts = parts[1:]
module = '.'.join(parts)
bindings = {}
for node in tree.body:
    if isinstance(node, ast.ImportFrom):
        base = parts[:-node.level] if node.level else []
        origin = '.'.join(base + ([node.module] if node.module else []))
        for helper in data['helpers']:
            target = helper['file'].removesuffix('.py').removeprefix('src/').replace('/', '.')
            if origin == target:
                for alias in node.names:
                    if alias.name == helper['name']:
                        bindings[alias.asname or alias.name] = helper['name']
    elif isinstance(node, ast.Import):
        for alias in node.names:
            for helper in data['helpers']:
                target = helper['file'].removesuffix('.py').removeprefix('src/').replace('/', '.')
                if alias.name == target:
                    bindings[(alias.asname or alias.name) + '.' + helper['name']] = helper['name']
for helper in data['helpers']:
    if helper['file'] == file['file']: bindings[helper['name']] = helper['name']
for node in ast.walk(tree):
    if isinstance(node, ast.Call) and node.lineno in file['addedLines']:
        name = ast.unparse(node.func)
        if name in bindings:
            print(bindings[name]); sys.exit(0)
print('')
`;

export function labelReuse(task: Task, files: AddedFile[], python = 'python3'): ReuseLabel {
  const production = files.filter(f => /\.(?:py|[cm]?[jt]sx?)$/.test(f.file)
    && !/(?:^|\/)(?:tests?|testing|__tests__|specs?|docs?|fixtures|node_modules)\//.test(f.file)
    && !/(?:^|\/)(?:test_[^/]*\.py|[^/]*_test\.py|[^/]*\.(?:test|spec)\.[cm]?[jt]sx?)$/.test(f.file));
  for (const file of production) {
    let helper: string | undefined;
    if (file.file.endsWith('.py')) {
      const result = spawnSync(python, ['-c', pythonReuse], { input: JSON.stringify({ file: { ...file, addedLines: [...file.addedLines] }, helpers: task.helpers }), encoding: 'utf8', timeout: 10_000 });
      if (result.status !== 0) return { label: 'unknown', reason: `Python call analysis unavailable: ${result.error?.message ?? result.stderr}`, source: 'automated' };
      helper = result.stdout.trim() || undefined;
    } else helper = typescriptReuse(task, file);
    if (helper) return { label: 'reused', reason: `Added production call resolves to ${helper}; static import/call heuristic, not proof of semantic reuse.`, source: 'automated' };
  }
  const implementation = production.some(file => [...file.addedLines].some(line => {
    const text = file.source.split('\n')[line - 1]?.trim() ?? '';
    return text && !/^(?:#|\/\/|\/\*|\*|import\b|from\b|export\s*\{|[{};]+$)/.test(text);
  }));
  return implementation
    ? { label: 'duplicate', reason: 'Added production implementation without a resolved helper call; provisional task-specific reimplementation heuristic. Human review required for alternative designs.', source: 'automated' }
    : { label: 'unknown', reason: 'No added production implementation to classify.', source: 'automated' };
}

export function applyOverride(result: ReuseLabel, override?: Override): ReuseLabel {
  return override ? { label: override.label, reason: `${override.reviewer}: ${override.reasoning}`, source: 'human' } : result;
}

export interface ReviewRow {
  suite?: Suite; kind?: CheckFinding['kind'];
  task_id: string; arm: Arm; added: CheckFinding['added']; existing: CheckFinding['existing'];
  probability?: number; signals: CheckFinding['signals']; verdict: 'agree' | 'disagree' | null;
  reviewer: string | null; reasoning: string | null;
  resolved_by?: { commit: string; note: string };
}
const reviewIdentity = (row: Pick<ReviewRow, 'suite' | 'task_id' | 'arm' | 'added' | 'existing'>) => JSON.stringify([row.suite ?? 'reuse-v2', row.task_id, row.arm, row.added, row.existing]);
export const reviewKey = (row: Pick<ReviewRow, 'suite' | 'kind' | 'task_id' | 'arm' | 'added' | 'existing'>) => JSON.stringify([reviewIdentity(row), row.kind ?? 'duplicate']);
export function aggregateReview(results: Result[], previous: ReviewRow[], suite: Suite = 'reuse-v2', taskIds?: ReadonlySet<string>): ReviewRow[] {
  const old = new Map(previous.map(row => [reviewKey(row), row]));
  const legacy = new Map(previous.filter(row => !row.kind).map(row => [reviewIdentity(row), row]));
  const rows = new Map(previous.filter(row => row.resolved_by || (row.suite ?? 'reuse-v2') !== suite || (taskIds && !taskIds.has(row.task_id))).map(row => [reviewKey(row), row]));
  for (const result of results) for (const finding of result.check.findings) {
    if (result.check.status === 'UNAVAILABLE' || finding.severity !== 'BLOCK' || (suite === 'reuse-v2' && !['duplicate', 'duplicate-constant', 'duplicate-file'].includes(finding.kind))) continue;
    const row: ReviewRow = { suite, kind: finding.kind, task_id: result.task_id, arm: result.arm, added: finding.added, existing: finding.existing,
      probability: finding.probability, signals: finding.signals, verdict: null, reviewer: null, reasoning: null };
    const key = reviewKey(row), prior = old.get(key) ?? legacy.get(reviewIdentity(row));
    if (prior && ((prior.resolved_by && prior.verdict === 'disagree') ||
      (prior.probability === row.probability && JSON.stringify(prior.signals) === JSON.stringify(row.signals)))) {
      row.verdict = prior.verdict; row.reviewer = prior.reviewer; row.reasoning = prior.reasoning;
    }
    if (prior?.resolved_by) row.resolved_by = prior.resolved_by;
    rows.set(key, row);
  }
  return [...rows.values()];
}

export function summarize(results: Result[]) {
  const arms = Object.fromEntries((['baseline', 'groundwork'] as const).map(arm => {
    const runs = results.filter(r => r.arm === arm), n = runs.length;
    const known = runs.filter(r => r.reuse.label !== 'unknown'), duplicates = known.filter(r => r.reuse.label === 'duplicate').length;
    const successes = runs.filter(r => r.success).length, acus = runs.flatMap(r => r.acus === null ? [] : [r.acus]);
    return [arm, { n, duplicates: { count: duplicates, n: known.length, rate: known.length ? duplicates / known.length : null, ci: wilson(duplicates, known.length) },
      reviewedLabels: runs.filter(r => r.reuse.source === 'human').length,
      unknownLabels: n - known.length, success: { count: successes, n, rate: n ? successes / n : null, ci: wilson(successes, n) },
      acus: { n: acus.length, mean: acus.length ? acus.reduce((a, b) => a + b, 0) / acus.length : null },
      check: { unavailable: runs.filter(r => r.check.status === 'UNAVAILABLE').length,
        BLOCK: runs.reduce((sum, r) => sum + r.check.findings.filter(f => f.severity === 'BLOCK').length, 0),
        WARN: runs.reduce((sum, r) => sum + r.check.findings.filter(f => f.severity === 'WARN').length, 0) } }];
  })) as Record<Arm, { n: number; duplicates: {count: number; n: number; rate: number | null; ci: Interval | null}; reviewedLabels: number; unknownLabels: number;
    success: {count: number; n: number; rate: number | null; ci: Interval | null}; acus: {n: number; mean: number | null}; check: {unavailable: number; BLOCK: number; WARN: number} }>;
  const a = arms.baseline, b = arms.groundwork;
  const difference = (field: 'duplicates' | 'success') => ({
    estimate: a[field].rate === null || b[field].rate === null ? null : a[field].rate - b[field].rate,
    ci: newcombe(a[field].count, a[field].n, b[field].count, b[field].n),
  });
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), arms,
    differences: { direction: 'baseline-groundwork', duplicates: difference('duplicates'), success: difference('success') } };
}
export type Summary = ReturnType<typeof summarize>;
const percent = (n: number | null) => n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`;
const interval = (ci: Interval | null) => ci ? `[${percent(ci.low)}, ${percent(ci.high)}]` : 'n/a';
export function renderReport(report: Summary): string {
  const lines = ['# Benchmark v2', '', '| Arm | n | Duplicates / labeled | Duplicate rate (Wilson 95%) | Task success (Wilson 95%) | Mean ACUs (n) | GW BLOCK / WARN | GW unavailable |',
    '| --- | ---: | ---: | --- | --- | --- | ---: | ---: |'];
  for (const arm of ['baseline', 'groundwork'] as const) {
    const r = report.arms[arm];
    lines.push(`| ${arm} | ${r.n} | ${r.duplicates.count}/${r.duplicates.n} | ${percent(r.duplicates.rate)} ${interval(r.duplicates.ci)} | ${r.success.count}/${r.n}: ${percent(r.success.rate)} ${interval(r.success.ci)} | ${r.acus.mean?.toFixed(2) ?? 'n/a'} (${r.acus.n}) | ${r.check.BLOCK} / ${r.check.WARN} | ${r.check.unavailable} |`);
  }
  lines.push('', `Reviewed label overrides: baseline ${report.arms.baseline.reviewedLabels}/${report.arms.baseline.n}; groundwork ${report.arms.groundwork.reviewedLabels}/${report.arms.groundwork.n}. See labels.jsonl for attribution; agent review is not independent human review.`,
    '', 'Differences are baseline − groundwork (percentage points), with independent-proportions Newcombe 95% intervals. These are descriptive intervals, not paired-task inference.', '');
  for (const key of ['duplicates', 'success'] as const) {
    const d = report.differences[key];
    const points = (n: number) => `${(100 * n).toFixed(1)} pp`;
    lines.push(`- ${key}: ${d.estimate === null ? 'n/a' : points(d.estimate)}; 95% CI ${d.ci ? `[${points(d.ci.low)}, ${points(d.ci.high)}]` : 'n/a'}`);
  }
  lines.push('', 'Duplicate counts are per-run binary labels, not counts of every duplicated function. Unknown labels are excluded from duplicate-rate denominators, never treated as clean. Apply/execution failures count as task failures. GW counts cover available checks only; unavailable checks are not zero-finding evidence.',
    '', 'Automated reuse labels are static heuristics, not semantic judgments. Decisions supplied by agents are not trusted as evidence. Human labels in labels.jsonl take precedence. ACUs are reported as ACUs, not tokens. Missing arms/tasks and small samples are not a completed 20-task experiment.', '');
  return lines.join('\n');
}

export function renderReview(rows: ReviewRow[], scoring: ReviewScoring[] = []): string {
  const summary = summarizeBlockReview(rows, scoring);
  const escape = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  return ['# BLOCK review', '', `${summary.agree}/${summary.reviewed} independent reviewed BLOCK pairs agree (${percent(summary.reviewed ? summary.agreement : null)}); ${summary.pending} pending independent pairs. Agreement requires a verdict, reviewer and reasoning.`, '',
    BLOCK_REVIEW_POLICY, '', 'Waves 5–6 are copy-inviting by design: their BLOCKs measure precision on agent-made copies, not natural duplicate incidence or task success. Wave 6 keeps vendored bodies unchanged and puts behavior changes in separate wrappers; hard negatives request behaviorally different code without vendoring. The eligible unused got production target pool is exhausted; the approved wave-6 split is 12 Click and 12 pytest clones, with one hard negative per repository and a short got reference exception.', '', resolutionDetail(rows, scoring), '',
    `Recorded reviewers: ${[...new Set(rows.map(row => row.reviewer?.trim()).filter(Boolean))].sort().join('; ') || 'none'}.`, '',
    `${summary.symbolAgree}/${summary.symbolReviewed} distinct reviewed BLOCK pairs agree (${percent(summary.symbolReviewed ? summary.symbolAgreement : null)}); ${summary.symbolPending} pending symbol pairs before excluding covered nested functions.`, '',
    `${summary.rawReviewed}/${summary.rawRows} raw rows reviewed; ${summary.rawRows - summary.rawReviewed} raw rows pending. ${summary.coveredFileRows} duplicate-file rows covered by reviewed symbol-level BLOCKs are excluded from distinct counts. File-qualified symbol pairs count once across tasks, arms and line numbers; conflicting attributed verdicts count as disagree.`, '',
    `${summary.coveredNestedRows} nested-function rows covered by reviewed enclosing-symbol pairs are excluded from independent counts. Coverage requires matching added and existing file pairs and dotted symbol ancestry on both sides.`, '',
    `Gate: ${summary.reviewed >= 10 && summary.agreement >= 0.9 ? 'PASS' : 'FAIL'}; requires >=10 independent reviewed pairs and >=90% agreement.`, '',
    '| Suite | Task | Arm | Kind | Added | Existing | Probability | Signals | Verdict | Reviewer | Reasoning | Resolution |', '| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |',
    ...rows.map(r => `| ${[r.suite ?? 'reuse-v2', r.task_id, r.arm, r.kind ?? '', `${r.added.file}:${r.added.line} ${r.added.symbol}`, r.existing ? `${r.existing.file}:${r.existing.line} ${r.existing.symbol}` : '', r.probability ?? '', JSON.stringify(r.signals), r.verdict, r.reviewer, r.reasoning, r.resolved_by ? `${r.resolved_by.commit}: ${r.resolved_by.note}` : ''].map(escape).join(' | ')} |`), ''].join('\n');
}

export function renderBlockReport(results: Result[], expectedTasks: number): string {
  const unavailable = results.filter(r => r.check.status === 'UNAVAILABLE').length;
  return ['# BLOCK evidence wave', '', `${results.length}/${expectedTasks} baseline runs scored; ${unavailable} GW checks UNAVAILABLE.`, '',
    'Check-only suite: acceptance and task success are not evaluated. Task kinds are sampling annotations, not duplicate verdicts. Every BLOCK requires review, especially hard negatives. UNAVAILABLE is not zero-finding evidence.', '',
    '| Task | Kind | Patch/execution | GW | BLOCK | WARN |', '| --- | --- | --- | --- | ---: | ---: |',
    ...results.map(r => {
      const count = (severity: string) => r.check.status === 'UNAVAILABLE' ? 'n/a' : r.check.findings.filter(f => f.severity === severity).length;
      return `| ${r.task_id} | ${r.task_kind ?? ''} | ${r.status} | ${r.check.status} | ${count('BLOCK')} | ${count('WARN')} |`;
    }), '', 'See block-results/ for patches\' application/check errors and block-review.json for the shared, suite-attributed review queue.', ''].join('\n');
}

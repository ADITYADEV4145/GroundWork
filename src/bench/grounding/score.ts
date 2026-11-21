import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grounder } from '../../grounding/verify.js';
import { discoverFiles } from '../../index/discover.js';
import { callFacts, fileFacts } from '../../index/query.js';
import { refreshIndex } from '../../index/refresh.js';
import { indexDbPath } from '../../index/store.js';
import { defaultConfig } from '../../config/load.js';
import { INDEXED_EXTENSIONS, languageForPath } from '../../lang/parser.js';
import { initSqlBackend, openDb } from '../../store/db.js';
import { acceptance, type AcceptanceCheck } from './acceptance.js';
import { diagnosticCallSite } from './diagnostic-site.js';
import { armSchema, dataRoot, filesUnder, siblingPairs, tasks, taskSetHash, type Arm, type Task } from './tasks.js';
import { git, type RunManifest } from './workspaces.js';

export interface CallError { file: string; line: number; column?: number; kind: string; name: string; message: string; evidence: string[] }
export interface TaskRow {
  task: string; repo: string; success: boolean; wrongCallsFinal: number; hiddenFailuresCaused: number; fixTokensProxy: number;
  finalCommit: string; steps: number; errors: CallError[]; checks: AcceptanceCheck[]; missingGroundTruth: string[]; unchecked: string[];
  fixes: { commit: string; errors: string[]; diffChars: number; feedbackChars: number }[];
}
export interface ArmResults { version: 3; arm: Arm; taskSetHash: string; agent: string; proxy: string; rows: TaskRow[] }
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const canonical = (kind: string) => kind === 'unknown-call' ? 'unknown-name' : kind;
function combine(errors: CallError[]): CallError[] {
  const map = new Map<string, CallError>();
  for (const error of errors) {
    error.kind = canonical(error.kind);
    if (error.column === undefined && error.evidence.includes('runtime') && error.kind !== 'unknown-export')
      error.column = errors.find((e) => e.file === error.file && e.line === error.line && e.name === error.name && e.column !== undefined)?.column;
    const key = `${error.file}:${error.line}:${error.column ?? 'import'}:${error.name}`;
    const prev = map.get(key);
    if (prev) prev.evidence = [...new Set([...prev.evidence, ...error.evidence])];
    else map.set(key, error);
  }
  return [...map.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || (a.column ?? -1) - (b.column ?? -1) || a.name.localeCompare(b.name));
}
export function incidentKeys(errors: CallError[]): string[] {
  const ordinals = new Map<string, number>();
  return errors.map((e) => {
    const key = `${e.file}:${e.kind}:${e.name}`, n = ordinals.get(key) ?? 0;
    ordinals.set(key, n + 1);
    return `${key}:${n}`;
  });
}

interface Snapshot { errors: CallError[]; checks: AcceptanceCheck[]; missingGroundTruth: string[]; unchecked: string[]; feedback: string[] }
async function inspect(task: Task, dir: string, root: string): Promise<Snapshot> {
  await initSqlBackend();
  await refreshIndex(dir);
  const db = openDb(indexDbPath(dir), { readonly: true });
  try {
    const files = discoverFiles(dir, defaultConfig());
    const grounder = new Grounder(db, dir), errors: CallError[] = [], unchecked: string[] = [];
    for (const file of files) {
      const result = grounder.verify(file);
      if (result.unchecked) unchecked.push(`${file}: ${result.unchecked}`);
      for (const f of result.findings) errors.push({ file, line: f.line, column: f.column, kind: f.kind, name: f.name, message: f.message, evidence: ['grounding'] });
    }
    const calls = files.flatMap((file) => {
      const fact = fileFacts(db, file);
      return fact ? callFacts(db, fact.id).map((c) => ({ file, line: c.line, column: c.column, name: c.calleeName, keywords: c.keywordArgs, resolved: c.calleeId !== null })) : [];
    });
    for (const error of errors) {
      if (error.kind === 'unknown-keyword') error.name = calls.find((c) => c.file === error.file && c.line === error.line && c.column === error.column && c.keywords.includes(error.name))?.name ?? error.name;
      else if (error.kind === 'arity' || error.kind === 'unknown-member') error.name = error.name.split('.').at(-1)!;
    }
    const checks = acceptance(task, dir, root);
    for (const check of checks.filter((c) => !c.passed)) {
      if (check.id === 'typescript') {
        for (const match of check.output.matchAll(/([^\n]+?)\((\d+),(\d+)\): error TS(\d+): ([^\n]+)/g)) {
          const file = path.relative(dir, path.resolve(dir, match[1]!)).split(path.sep).join('/'), line = Number(match[2]), column = Number(match[3]) - 1, code = Number(match[4]), message = match[5]!;
          const supported: Record<number, string> = { 2304: 'unknown-name', 2305: 'unknown-export', 2307: 'missing-module', 2339: 'unknown-member', 2554: 'arity', 2353: 'unknown-keyword', 2345: 'wrong-argument' };
          const kind = supported[code];
          if (!kind || !files.includes(file)) continue;
          const quoted = [...message.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
          const site = diagnosticCallSite(file, readFileSync(path.join(dir, file), 'utf8'), line, column, code, message);
          const call = site ? calls.find((c) => c.file === file && c.line === site.line && c.column === site.column && c.name === site.name && (code !== 2304 || quoted.includes(c.name))) : undefined;
          if (code === 2304 && !call) continue;
          if ([2554, 2345, 2353].includes(code) && !call?.resolved) continue;
          if (code === 2339 && call?.name !== quoted[0]) continue;
          const name = [2554, 2345, 2353].includes(code) ? call!.name : code === 2305 ? quoted.at(-1)! : quoted[0]!;
          errors.push({ file, line: call?.line ?? line, column: [2305, 2307].includes(code) ? undefined : call?.column ?? column, kind, name, message, evidence: ['compiler', `check:${check.id}`] });
        }
      } else {
        const exception = /(?:NameError|ReferenceError): (?:name )?['"]?(\w+)['"]? (?:is not defined|is not a function)|AttributeError: [^\n]*has no attribute ['"](\w+)['"]|ImportError: cannot import name ['"](\w+)['"]|TypeError: ([\w.]+)\(\)[^\n]*(?:unexpected keyword|positional argument|required argument)/.exec(check.output);
        if (!exception) continue;
        const frames = [...check.output.matchAll(new RegExp(`(?:File ["']|file:\\/\\/)?${escape(dir)}/([^"'\\n():]+)(?:["'], line |:)(\\d+)`, 'g'))];
        const frame = frames.filter((f) => files.includes(f[1]!)).at(-1);
        if (!frame) continue;
        const name = (exception[1] ?? exception[2] ?? exception[3] ?? exception[4]!).split('.').at(-1)!;
        if (!exception[3] && !calls.some((c) => c.file === frame[1] && c.line === Number(frame[2]) && c.name === name)) continue;
        const kind = exception[2] ? 'unknown-member' : exception[3] ? 'unknown-export' : exception[4] ? (/keyword/.test(exception[0]) ? 'unknown-keyword' : 'arity') : 'unknown-name';
        errors.push({ file: frame[1]!, line: Number(frame[2]), name, kind, message: exception[0], evidence: ['runtime', `check:${check.id}`] });
      }
    }
    if (task.repo === 'dispatch-desk') {
      const script = fileURLToPath(new URL('python-unknown.py', import.meta.url));
      // TypeScript builds do not copy Python assets; the scorer runs from the checkout.
      const source = existsSync(script) ? script : path.join(dataRoot, '../../src/bench/grounding/python-unknown.py');
      const py = spawnSync('python3', [source, dir], { input: JSON.stringify(files.filter((f) => f.endsWith('.py'))), encoding: 'utf8', timeout: 10_000 });
      if (py.status !== 0) throw new Error(`Python static check failed: ${py.error?.message ?? py.stderr}`);
      for (const e of JSON.parse(py.stdout) as { file: string; line: number; column: number; name: string }[])
        errors.push({ ...e, kind: 'unknown-name', message: `Unbound bare call ${e.name}`, evidence: ['python-ast'] });
    }
    // A valid sibling API is only labelled wrong if a one-name repair makes all acceptance checks pass.
    if (checks.some((c) => !c.passed)) {
      const original = readFileSync(path.join(dir, task.target), 'utf8');
      for (const [wrong, correct] of siblingPairs[task.repo]) {
        if (!task.symbols.some((s) => s.endsWith(`#${correct}`) || s.endsWith(`.${correct}`))) continue;
        const sites = calls.filter((c) => c.file === task.target && c.name === wrong);
        if (!sites.length) continue;
        try {
          writeFileSync(path.join(dir, task.target), original.replace(new RegExp(`\\b${escape(wrong)}\\b`, 'g'), correct));
          if (acceptance(task, dir, root).every((c) => c.passed))
            for (const site of sites) errors.push({ ...site, kind: 'wrong-sibling', message: `${wrong} -> ${correct} alone restores acceptance`, evidence: ['counterfactual'] });
        } finally { writeFileSync(path.join(dir, task.target), original); }
      }
    }
    const targetFacts = fileFacts(db, task.target);
    const targetCalls = targetFacts ? callFacts(db, targetFacts.id) : [];
    const missingGroundTruth = task.symbols.filter((s) => !targetCalls.some((c) => c.calleeName === s.split('.').at(-1)!.split('#').at(-1)));
    const feedbackFile = path.join(dir, '.benchmark/feedback.jsonl');
    const feedback = existsSync(feedbackFile) ? readFileSync(feedbackFile, 'utf8').split('\n').filter(Boolean) : [];
    for (const line of feedback) JSON.parse(line);
    const clean = (text: string) => text.replaceAll(dir, '<workspace>').replaceAll(root, '<benchmark>').replace(/\(node:\d+\)/g, '(node:<pid>)');
    return { errors: combine(errors).map((e) => ({ ...e, message: clean(e.message) })), checks: checks.map((c) => ({ ...c, output: clean(c.output) })), missingGroundTruth, unchecked, feedback };
  } finally { db.close(); }
}

function archive(workspace: string, revision: string, dir: string): void {
  mkdirSync(dir);
  if (git(workspace, 'ls-tree', '-r', revision).split('\n').some((l) => l.startsWith('120000') || l.startsWith('160000'))) throw new Error('Symlinks/submodules are not supported in benchmark submissions');
  const tar = execFileSync('git', ['archive', '--format=tar', revision], { cwd: workspace, maxBuffer: 32 * 1024 * 1024 });
  const unpack = spawnSync('tar', ['-xf', '-', '-C', dir], { input: tar, encoding: 'utf8' });
  if (unpack.status !== 0) throw new Error(`Cannot unpack submission: ${unpack.stderr}`);
}

export async function scoreTask(task: Task, workspace: string, base: string, root = dataRoot, requireFeedback = false): Promise<TaskRow> {
  if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Invalid base commit');
  if (git(workspace, 'rev-parse', '--is-shallow-repository') === 'true') throw new Error('Scoring requires complete local step history');
  if (git(workspace, 'status', '--porcelain', '--untracked-files=all')) throw new Error(`${task.id}: commit all edits before scoring`);
  git(workspace, 'merge-base', '--is-ancestor', base, 'HEAD');
  const finalCommit = git(workspace, 'rev-parse', 'HEAD');
  const revisions = git(workspace, 'rev-list', '--reverse', `${base}..HEAD`).split('\n').filter(Boolean);
  if (git(workspace, 'rev-list', '--merges', `${base}..HEAD`)) throw new Error(`${task.id}: merge commits obscure edit steps`);
  if (revisions.some((r) => !git(workspace, 'show', '-s', '--format=%s', r).startsWith('step:'))) throw new Error(`${task.id}: expected one step: commit per edit`);
  const work = mkdtempSync(path.join(os.tmpdir(), 'gw-v3-score-'));
  try {
    let previous: Snapshot | undefined, final!: Snapshot;
    const active = new Map<string, { start: number; name: string }>();
    const fixes: TaskRow['fixes'] = [], snapshots: Snapshot[] = [], chargedFeedback = new Set<number>();
    for (const [i, rev] of [base, ...revisions].entries()) {
      const dir = path.join(work, String(i));
      archive(workspace, rev, dir);
      const fixtures = path.join(root, 'repos', task.repo);
      for (const file of filesUnder(fixtures)) {
        const expected = readFileSync(path.join(fixtures, file));
        if (i === 0 || file !== task.target) {
          if (!existsSync(path.join(dir, file)) || !readFileSync(path.join(dir, file)).equals(expected)) throw new Error(`${task.id}: protected fixture changed: ${file}`);
        }
      }
      final = await inspect(task, dir, root);
      if (previous && (final.feedback.length < previous.feedback.length || previous.feedback.some((l, n) => l !== final.feedback[n]))) throw new Error(`${task.id}: feedback history was rewritten`);
      if (requireFeedback && previous) {
        const edited = git(workspace, 'diff', '--name-only', `${rev}^`, rev).split('\n').filter((f) => languageForPath(f) !== null);
        const records = final.feedback.slice(previous.feedback.length).map((line) => JSON.parse(line) as { base: string; files: string[] });
        const parent = git(workspace, 'rev-parse', `${rev}^`);
        if (edited.some((file) => !records.some((r) => r.base === parent && r.files.some((f) => path.relative(workspace, path.resolve(workspace, f)).split(path.sep).join('/') === file))))
          throw new Error(`${task.id}: source edit ${rev} lacks recorded per-file grounding feedback`);
      }
      snapshots.push(final);
      const keys = incidentKeys(final.errors), current = new Set(keys);
      const fixed = [...active.keys()].filter((k) => !current.has(k));
      if (fixed.length) {
        const diff = execFileSync('git', ['diff', '--no-ext-diff', '--no-color', '--unified=0', `${rev}^`, rev, '--', ...INDEXED_EXTENSIONS.map((ext) => `*${ext}`)], { cwd: workspace, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        const names = fixed.map((k) => active.get(k)!.name);
        const start = Math.min(...fixed.map((k) => active.get(k)!.start));
        const offset = snapshots[start - 1]?.feedback.length ?? 0;
        const relevant = final.feedback.slice(offset).flatMap((line, n) => {
          const record = JSON.parse(line) as { stdout?: string; stderr?: string };
          const text = (record.stdout ?? '') + (record.stderr ?? '');
          if (chargedFeedback.has(offset + n) || !names.some((name) => text.includes(name))) return [];
          chargedFeedback.add(offset + n);
          return [text];
        });
        fixes.push({ commit: rev, errors: fixed, diffChars: diff.length, feedbackChars: relevant.join('').length });
        for (const key of fixed) active.delete(key);
      }
      for (const [n, key] of keys.entries()) if (!active.has(key) && i > 0) active.set(key, { start: i, name: final.errors[n]!.name });
      previous = final;
      rmSync(dir, { recursive: true, force: true });
    }
    const hiddenFailuresCaused = final.checks.filter((c) => !c.passed && final.errors.some((e) => e.evidence.includes('counterfactual') || e.evidence.includes(`check:${c.id}`)
      || (e.kind === 'unknown-export' && new RegExp(`SyntaxError:[^\\n]*does not provide an export named ['"]${escape(e.name)}['"]`).test(c.output)))).length;
    return { task: task.id, repo: task.repo, success: final.checks.every((c) => c.passed), finalCommit, steps: revisions.length,
      wrongCallsFinal: final.errors.length, hiddenFailuresCaused, fixTokensProxy: fixes.reduce((sum, f) => sum + (f.diffChars + f.feedbackChars) / 4, 0),
      errors: final.errors, checks: final.checks, missingGroundTruth: final.missingGroundTruth, unchecked: final.unchecked, fixes };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

export async function score(out: string, arm: Arm, agent: string, resultsDir = path.join(dataRoot, 'results'), root = dataRoot): Promise<ArmResults> {
  armSchema.parse(arm);
  if (!agent.trim()) throw new Error('Supply a nonempty --agent label');
  const run = JSON.parse(readFileSync(path.join(out, 'run.json'), 'utf8')) as RunManifest;
  if (run.version !== 3 || run.arm !== arm || run.taskSetHash !== taskSetHash(root)) throw new Error('Prepared arm/task-set hash does not match current tasks');
  const all = tasks(root);
  if (run.workspaces.length !== 15 || new Set(run.workspaces.map((w) => w.task)).size !== 15 || all.some((t) => !run.workspaces.some((w) => w.task === t.id))) throw new Error('Score requires all 15 task workspaces; prepare all three repositories into this arm directory');
  const rows: TaskRow[] = [];
  for (const task of all) rows.push(await scoreTask(task, path.join(out, task.id), run.workspaces.find((w) => w.task === task.id)!.base, root, arm === 'groundwork'));
  const result: ArmResults = { version: 3, arm, agent, taskSetHash: run.taskSetHash,
    proxy: 'chars/4 of complete source fix-commit diffs (headers included, once per fixing commit) plus matching recorded feedback text; not model usage or actual tokens; conservative errors and observed committed steps only', rows };
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(path.join(resultsDir, `${arm}.json`), JSON.stringify(result, null, 2) + '\n');
  return result;
}

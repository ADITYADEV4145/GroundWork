import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type * as TS from 'typescript';
import { defaultConfig } from '../src/config/load.js';
import { changeImpact, type ImpactReport } from '../src/impact/index.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const data = path.join(project, 'bench/impact');
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
interface Task { id: string; repo: string; file: string; name: string; operator: string; before: string; after: string }
interface Manifest { version: number; sourceCommit: string; tasks: Task[] }
interface Diagnostic { file: string; line: number; code: string | number; message: string }
interface Row { task: Task; expectedCallers: string[]; expectedTests: string[]; listedCallers: string[]; listedTests: string[]; missingCallers: string[]; missingTests: string[]; falsePositiveCallers: string[]; baseline: Diagnostic[]; diagnostics: Diagnostic[]; newErrors: Diagnostic[]; impact: ImpactReport | null; highRisk: boolean; errors: string[]; ms: number; oracleMs: number }
export function registeredTasks(directory = data): { manifest: Manifest; sha256: string } {
  const expected = /Manifest SHA256: `([a-f0-9]{64})`/.exec(readFileSync(path.join(directory, 'PREREGISTRATION.md'), 'utf8'))?.[1];
  const bytes = readFileSync(path.join(directory, 'tasks.json'));
  if (!expected || hash(bytes) !== expected) throw new Error('Refusing impact benchmark: task manifest SHA256 differs');
  const manifest = JSON.parse(bytes.toString()) as Manifest;
  if (manifest.version !== 1 || manifest.tasks.length !== 16) throw new Error('Invalid registered impact tasks');
  return { manifest, sha256: expected };
}
const testPath = (file: string) => /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^.]+$|(^|\/)test_[^/]*\.py$|_test\.py$/.test(file);
const identity = (d: Diagnostic) => JSON.stringify([d.file, d.code, d.message.replace(/\s+/g, ' ').trim()]);
const distinct = (files: string[]) => [...new Set(files)].sort();
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]! : null;

function diagnostics(root: string, files: string[], ts: typeof TS): Diagnostic[] {
  const python = files.filter((f) => f.endsWith('.py'));
  if (python.length) {
    let output: string;
    try { output = execFileSync('pyright', ['--outputjson', ...python], { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) {
      const e = error as { status?: number; stdout?: string };
      if (e.status !== 1 || !e.stdout) throw error; output = String(e.stdout);
    }
    const result = JSON.parse(output) as { generalDiagnostics: { file: string; severity: string; rule?: string; message: string; range: { start: { line: number } } }[] };
    return result.generalDiagnostics.filter((d) => d.severity === 'error').map((d) => ({ file: path.relative(root, d.file), line: d.range.start.line + 1, code: d.rule ?? 'unknown', message: d.message }));
  }
  const config = ts.findConfigFile(root, ts.sys.fileExists);
  const parsed = config ? ts.parseJsonConfigFileContent(ts.readConfigFile(config, ts.sys.readFile).config, ts.sys, root) : null;
  const program = ts.createProgram(files.filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(root, f)), parsed?.options ?? { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
  const scope = new Set(files);
  return ts.getPreEmitDiagnostics(program).filter((d) => d.file && d.start !== undefined && d.category === ts.DiagnosticCategory.Error && scope.has(path.relative(root, d.file.fileName))).map((d) => ({
    file: path.relative(root, d.file!.fileName), line: d.file!.getLineAndCharacterOfPosition(d.start!).line + 1,
    code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }));
}

/** Independent syntax/filesystem oracle, not the indexed import graph under evaluation. */
export function affectedTests(root: string, files: string[], target: string, ts: typeof TS): string[] {
  const scope = new Set(files), edges: { from: string; to: string }[] = [];
  const resolve = (file: string, spec: string) => {
    let candidate: string;
    if (file.endsWith('.py')) {
      const dots = /^\.+/.exec(spec)?.[0].length ?? 0;
      candidate = dots ? path.posix.join(path.posix.dirname(file), ...Array(Math.max(0, dots - 1)).fill('..'), spec.slice(dots).replaceAll('.', '/')) : spec.replaceAll('.', '/');
      return [candidate + '.py', candidate + '/__init__.py'].find((f) => scope.has(f));
    }
    if (!spec.startsWith('.')) return undefined;
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    return [candidate, candidate.replace(/\.js$/, '.ts'), candidate + '.ts', candidate + '/index.ts'].find((f) => scope.has(f));
  };
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8');
    const specs = file.endsWith('.py') ? [...source.matchAll(/^\s*from\s+([.\w]+)\s+import\s/gm)].map((m) => m[1]!) : ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true).statements.flatMap((s) => (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) ? [s.moduleSpecifier.text] : []);
    for (const spec of specs) { const to = resolve(file, spec); if (to) edges.push({ from: file, to }); }
  }
  const seen = new Set([target]); let frontier = [target];
  const tests = new Set<string>();
  for (let depth = 0; depth < 2; depth++) {
    const next: string[] = [];
    for (const edge of edges) if (frontier.includes(edge.to) && !seen.has(edge.from)) { seen.add(edge.from); next.push(edge.from); if (testPath(edge.from)) tests.add(edge.from); }
    frontier = next;
  }
  return [...tests].sort();
}

export function summarize(rows: Row[]) {
  const expectedCallers = rows.reduce((n, r) => n + r.expectedCallers.length, 0), expectedTests = rows.reduce((n, r) => n + r.expectedTests.length, 0);
  const callersFound = rows.reduce((n, r) => n + r.expectedCallers.length - r.missingCallers.length, 0), testsFound = rows.reduce((n, r) => n + r.expectedTests.length - r.missingTests.length, 0);
  const highs = rows.filter((r) => r.highRisk), accurateHighs = highs.filter((r) => r.expectedCallers.length > 0);
  const completes = rows.filter((r) => r.impact?.complete), accurateCompletes = completes.filter((r) => !r.missingCallers.length && !r.missingTests.length);
  const ratio = (n: number, d: number) => d ? n / d : null;
  const callerRecall = ratio(callersFound, expectedCallers), testRecall = ratio(testsFound, expectedTests), highRiskPrecision = ratio(accurateHighs.length, highs.length), completeAccuracy = ratio(accurateCompletes.length, completes.length);
  const gwP95 = percentile(rows.filter((r) => r.task.repo === 'groundwork').map((r) => r.ms), .95);
  const rules = { callerRecall: callerRecall !== null && callerRecall >= .9, highRiskPrecision: highRiskPrecision !== null && highRiskPrecision >= .9, testRecall: testRecall !== null && testRecall >= .9, completeAccuracy: completeAccuracy === 1, runtime: gwP95 !== null && gwP95 <= 1500 };
  const coverage = rows.length === 16 && rows.every((r) => !r.errors.length && r.impact);
  return { status: !coverage ? 'INCOMPLETE' : Object.values(rules).every(Boolean) ? 'PASS' : 'FAIL', coverage, callerRecall, callersFound, expectedCallers, highRiskPrecision, highRiskCorrect: accurateHighs.length, highRiskPredictions: highs.length, testRecall, testsFound, expectedTests, completeAccuracy, accurateCompletes: accurateCompletes.length, completeAnswers: completes.length, p50: percentile(rows.map((r) => r.ms), .5), p95: percentile(rows.map((r) => r.ms), .95), gwP95, rules };
}

function markdown(result: { manifestSha256: string; checkerCommit: string; rows: Row[]; summary: ReturnType<typeof summarize>; environment: object }) {
  const s = result.summary, rate = (value: number | null) => value === null ? 'undefined' : (value * 100).toFixed(2) + '%';
  const out = ['# Change-impact gate results', '', '**Deterministic tool-level evaluation, NOT an agent run. The actual agent gate is pending and was NOT run.**', '', `Manifest SHA256: \`${result.manifestSha256}\`. Checker commit: \`${result.checkerCommit}\`.`, '', `## Summary: ${s.status}`, '', '| Metric | Result | Threshold | Rule |', '| --- | --- | --- | --- |',
    `| Must-change caller-file recall | ${s.callersFound}/${s.expectedCallers} (${rate(s.callerRecall)}) | >=90% | ${s.rules.callerRecall ? 'PASS' : 'FAIL'} |`,
    `| High-risk task precision | ${s.highRiskCorrect}/${s.highRiskPredictions} (${rate(s.highRiskPrecision)}) | >=90% | ${s.rules.highRiskPrecision ? 'PASS' : 'FAIL'} |`,
    `| Affected-test-file recall | ${s.testsFound}/${s.expectedTests} (${rate(s.testRecall)}) | >=90% | ${s.rules.testRecall ? 'PASS' : 'FAIL'} |`,
    `| Complete-flag accuracy | ${s.accurateCompletes}/${s.completeAnswers} (${rate(s.completeAccuracy)}) | 100%, nonempty | ${s.rules.completeAccuracy ? 'PASS' : 'FAIL'} |`,
    `| GroundWork impact p95 | ${s.gwP95} ms | <=1500 ms | ${s.rules.runtime ? 'PASS' : 'FAIL'} |`, '', `All-task p50/p95: ${s.p50}/${s.p95} ms. Complete execution coverage: ${s.coverage}.`, '',
    '| Task | Caller files found/expected | Tests found/expected | High risk | complete | ms | Errors |', '| --- | ---: | ---: | --- | --- | ---: | --- |'];
  for (const r of result.rows) out.push(`| ${r.task.id} | ${r.expectedCallers.length - r.missingCallers.length}/${r.expectedCallers.length} | ${r.expectedTests.length - r.missingTests.length}/${r.expectedTests.length} | ${r.highRisk} | ${r.impact?.complete ?? 'unavailable'} | ${r.ms} | ${r.errors.join('; ').replaceAll('|', '\\|')} |`);
  out.push('', '## Missing caller/test files and completeness reasons', '');
  for (const r of result.rows) out.push(`- **${r.task.id}**: missing callers: ${r.missingCallers.join(', ') || 'none'}; missing tests: ${r.missingTests.join(', ') || 'none'}. Incomplete because: ${r.impact?.incompleteBecause.join('; ') || 'none'}.`);
  out.push('', '## Limitations and deviations', '', '- No post-registration checker fixes after observing results. No tasks removed, no selective reruns or threshold changes.', '- Compiler error files are a must-change proxy, not proof of semantic exhaustiveness. High-risk precision is task-level, not per-symbol calibration. Test oracle uses only static imports within depth two plus compiler errors.', '- complete describes indexed static evidence in one snapshot, not arbitrary dynamic runtime reachability. Zero complete answers is undefined accuracy and fails the registered rule, not a vacuous pass.', '- Timing excludes refresh, oracle and process startup. Stop uses a hard time-boxed worker; this benchmark does not measure total hook dispatch or establish agent behavior.', '- The source anchor predates impact implementation. GroundWork oracle rows may include API/compiler skew against current development dependencies; raw baseline and post-edit diagnostics are retained.', `- Environment: ${JSON.stringify(result.environment)}.`, '- Raw findings, false-positive caller listings, baseline/new diagnostics and timings are in results.json. Agent gate remains pending in ../AGENT-PROTOCOL.md.', '');
  return out.join('\n');
}

export async function runBenchmark() {
  const { manifest, sha256 } = registeredTasks();
  git(project, 'merge-base', '--is-ancestor', manifest.sourceCommit, 'HEAD');
  const parent = path.join(os.homedir(), 'work');
  if (!existsSync(parent)) throw new Error('Persistent work parent absent');
  const work = mkdtempSync(path.join(parent, 'gw-impact-gate-'));
  const environment = { node: process.version, typescript: (createRequire(path.join(project, 'package.json'))('typescript') as typeof TS).version, pyright: execFileSync('pyright', ['--version'], { encoding: 'utf8' }).trim() };
  if (environment.typescript !== '5.9.3' || environment.pyright !== 'pyright 1.1.414') throw new Error('Registered compiler versions differ');
  const config = defaultConfig(), rows: Row[] = [];
  await initSqlBackend();
  const roots = new Map<string, { root: string; files: string[]; baseline: Diagnostic[]; ts: typeof TS }>();
  for (const repo of [...new Set(manifest.tasks.map((t) => t.repo))]) {
    const root = path.join(work, repo);
    git(project, 'clone', '--quiet', '--shared', '--no-checkout', project, root);
    git(root, 'checkout', '--quiet', '--detach', manifest.sourceCommit);
    let target = root;
    if (repo !== 'groundwork') {
      target = path.join(work, repo + '-target');
      cpSync(path.join(root, 'bench/grounding/repos', repo), target, { recursive: true });
      const py = repo === 'dispatch-desk';
      cpSync(path.join(root, `bench/grounding/reference/${repo}.${py ? 'py' : 'ts'}.txt`), path.join(target, py ? 'dispatch/workflows.py' : 'src/workflows.ts'));
      const prefix = `bench/grounding/repos/${repo}/`;
      const tracked = git(root, 'ls-tree', '-r', '--name-only', 'HEAD', '--', prefix).split('\n').map((f) => f.slice(prefix.length));
      git(target, 'init', '--quiet'); git(target, 'add', '--', ...tracked);
      git(target, '-c', 'user.name=Benchmark', '-c', 'user.email=benchmark@localhost', 'commit', '--quiet', '-m', 'Frozen reference baseline');
    }
    symlinkSync(path.join(project, 'node_modules'), path.join(target, 'node_modules'), 'dir');
    const files = git(target, 'ls-files').split('\n').filter((f) => repo === 'dispatch-desk' ? f.endsWith('.py') : /\.tsx?$/.test(f));
    const ts = createRequire(path.join(target, 'package.json'))('typescript') as typeof TS;
    roots.set(repo, { root: target, files, baseline: diagnostics(target, files, ts), ts });
  }
  for (const task of manifest.tasks) {
    const { root, files, baseline, ts } = roots.get(task.repo)!;
    const file = path.join(root, task.file), original = readFileSync(file, 'utf8');
    if (original.split(task.before).length !== 2) throw new Error(`Frozen before-text mismatch: ${task.id}`);
    const row: Row = { task, expectedCallers: [], expectedTests: [], listedCallers: [], listedTests: [], missingCallers: [], missingTests: [], falsePositiveCallers: [], baseline, diagnostics: [], newErrors: [], impact: null, highRisk: false, errors: [], ms: 0, oracleMs: 0 };
    writeFileSync(file, original.replace(task.before, task.after));
    try {
      const oracleStart = performance.now();
      row.diagnostics = diagnostics(root, files, ts);
      row.oracleMs = performance.now() - oracleStart;
      if (row.oracleMs > 30000) row.errors.push('compiler oracle exceeded 30-second budget');
      const prior = new Set(baseline.map(identity));
      row.newErrors = row.diagnostics.filter((d) => !prior.has(identity(d)));
      row.expectedCallers = distinct(row.newErrors.filter((d) => d.file !== task.file).map((d) => d.file));
      row.expectedTests = distinct([...row.expectedCallers.filter(testPath), ...affectedTests(root, files, task.file, ts)]);
      await refreshIndex(root, { config });
      const db = openDb(indexDbPath(root), { readonly: true });
      const start = performance.now();
      try { row.impact = await changeImpact(db, root, { base: 'HEAD', config }); }
      finally { row.ms = Number((performance.now() - start).toFixed(3)); db.close(); }
      if (row.impact.incompleteBecause.includes('impact timeout')) row.errors.push('impact timeout');
      row.listedCallers = distinct(row.impact.symbols.flatMap((s) => s.callers.map((c) => c.file)));
      row.listedTests = distinct(row.impact.symbols.flatMap((s) => s.tests.map((t) => t.file)));
      row.highRisk = row.impact.symbols.some((s) => s.risk === 'high');
    } catch (error) { row.errors.push((error as Error).message); }
    finally { writeFileSync(file, original); }
    row.missingCallers = row.expectedCallers.filter((f) => !row.listedCallers.includes(f));
    row.missingTests = row.expectedTests.filter((f) => !row.listedTests.includes(f));
    row.falsePositiveCallers = row.listedCallers.filter((f) => !row.expectedCallers.includes(f));
    rows.push(row);
    writeFileSync(path.join(work, 'progress.json'), JSON.stringify(rows, null, 2));
    console.log(`${task.id}: callers ${row.expectedCallers.length - row.missingCallers.length}/${row.expectedCallers.length}; tests ${row.expectedTests.length - row.missingTests.length}/${row.expectedTests.length}; complete=${row.impact?.complete}; ${row.ms} ms`);
  }
  const result = { manifestSha256: sha256, checkerCommit: git(project, 'rev-parse', 'HEAD'), generatedAt: new Date().toISOString(), environment, work, rows, summary: summarize(rows) };
  const out = path.join(data, 'results');
  if (existsSync(path.join(out, 'results.json'))) {
    const archive = path.join(out, `previous-${Date.now()}`); mkdirSync(archive);
    for (const file of ['results.json', 'RESULTS.md']) cpSync(path.join(out, file), path.join(archive, file));
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(path.join(out, 'RESULTS.md'), markdown(result));
  console.log(markdown(result).split('| Task |')[0]);
  return result;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try { if ((await runBenchmark()).summary.status !== 'PASS') process.exitCode = 1; }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}

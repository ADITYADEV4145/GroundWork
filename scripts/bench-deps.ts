// Seeded dependency-hallucination gate. Protocol: bench/deps/PREREGISTRATION.md. Run `npm run setup:deps-bench` first.
import { execFileSync, spawnSync } from 'node:child_process';
import dns from 'node:dns';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { loadConfig } from '../src/config/load.js';
import { DependencyChecker } from '../src/deps/check.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';

interface Case {
  id: string;
  ecosystem: 'npm' | 'pypi' | 'go' | 'maven';
  kind: string;
  prelude: string[];
  good: string;
  bad: string;
  probe?: string;
  note?: string;
}

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const spec = JSON.parse(readFileSync(path.join(repo, 'bench', 'deps', 'cases.json'), 'utf8')) as { cases: Case[]; packages: Record<string, Record<string, string>> };
const CACHE = process.env.GROUNDWORK_DEPS_BENCH ?? path.join(os.homedir(), '.cache', 'groundwork-bench', 'deps');
const project = path.join(CACHE, 'project');
const timing = path.join(CACHE, 'timing');
if (!existsSync(path.join(project, 'node_modules')) || !existsSync(path.join(timing, 'node_modules'))) {
  console.error('bench:deps: run `npm run setup:deps-bench` first');
  process.exit(2);
}
process.env.GROUNDWORK_M2 = path.join(CACHE, 'm2');

const EXT = { npm: 'ts', pypi: 'py', go: 'go', maven: 'java' } as const;

/** File text and the 1-based line of the seeded mistake (0 for the good-only variant). */
function render(c: Case, withBad: boolean): { text: string; badLine: number } {
  let lines: string[];
  if (c.ecosystem === 'go') {
    const imports = [...c.prelude, c.good, ...(withBad ? [c.bad] : [])];
    lines = ['package c', '', ...imports];
  } else if (c.ecosystem === 'maven') {
    const isImport = (l: string): boolean => l.startsWith('import ');
    const all = [...c.prelude, c.good, ...(withBad ? [c.bad] : [])];
    const body = all.filter((l) => !isImport(l));
    // Imports first, then statements inside a method; the seeded line stays last in its group.
    lines = [...all.filter(isImport), 'class C {', '  static void m() throws Exception {', ...body.map((l) => `    ${l}`), '  }', '}'];
  } else lines = [...c.prelude, c.good, ...(withBad ? [c.bad] : [])];
  const badLine = withBad ? lines.findIndex((l) => l.trim() === c.bad) + 1 : 0;
  return { text: lines.join('\n') + '\n', badLine };
}

function casePath(c: Case, variant: 'cases' | 'valid'): string {
  if (c.ecosystem === 'go') return `${variant}/go/${c.id.replace('-', '')}/c.go`;
  if (c.ecosystem === 'maven') return `${variant}/maven/${c.id.replace('-', '')}/C.java`;
  return `${variant}/${c.ecosystem}/${c.id.replace('-', '_')}.${EXT[c.ecosystem]}`;
}

// ---- generate ----
for (const dir of ['cases', 'valid', 'out']) rmSync(path.join(project, dir), { recursive: true, force: true });
const badLines = new Map<string, number>();
for (const c of spec.cases) {
  for (const variant of ['cases', 'valid'] as const) {
    const file = path.join(project, casePath(c, variant));
    mkdirSync(path.dirname(file), { recursive: true });
    const r = render(c, variant === 'cases');
    writeFileSync(file, r.text);
    if (variant === 'cases') badLines.set(c.id, r.badLine);
  }
}

// ---- ground truth from each ecosystem's own toolchain ----
const invalid = new Map<string, string>();
const reject = (c: Case, why: string): void => void (invalid.has(c.id) || invalid.set(c.id, why));

function tscErrors(files: string[]): Map<string, number[]> {
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true, types: ['node'], typeRoots: [path.join(project, 'node_modules', '@types')] };
  const program = ts.createProgram(files, options);
  const out = new Map<string, number[]>();
  for (const d of ts.getPreEmitDiagnostics(program)) {
    if (!d.file || d.start === undefined) continue;
    const list = out.get(d.file.fileName) ?? [];
    list.push(d.file.getLineAndCharacterOfPosition(d.start).line + 1);
    out.set(d.file.fileName, list);
  }
  return out;
}
{
  const npm = spec.cases.filter((c) => c.ecosystem === 'npm');
  const errors = tscErrors(npm.flatMap((c) => [path.join(project, casePath(c, 'cases')), path.join(project, casePath(c, 'valid'))]));
  for (const c of npm) {
    if (errors.get(path.join(project, casePath(c, 'valid')))?.length) reject(c, 'tsc rejects the good line');
    const bad = errors.get(path.join(project, casePath(c, 'cases'))) ?? [];
    if (!bad.includes(badLines.get(c.id)!)) reject(c, 'tsc accepts the bad line');
    else if (bad.some((l) => l !== badLines.get(c.id))) reject(c, 'tsc rejects a line other than the seeded one');
  }
}
{
  const py = spec.cases.filter((c) => c.ecosystem === 'pypi');
  const script = [
    'import inspect, json, sys, requests, requests.adapters, requests.exceptions, requests.utils, click, click.testing, yaml, jinja2',
    'def arity_fails(f, n):',
    '    try:',
    '        inspect.signature(f).bind(*[None] * n)',
    '        return False',
    '    except TypeError:',
    '        return True',
    'out = {}',
    ...py.flatMap((c) => [
      'try:',
      `    compile(open(${JSON.stringify(path.join(project, casePath(c, 'valid')))}).read(), 'x', 'exec')`,
      `    out[${JSON.stringify(c.id)}] = bool(${c.probe})`,
      'except Exception as e:',
      `    out[${JSON.stringify(c.id)}] = str(e)`,
    ]),
    'print(json.dumps(out))',
  ].join('\n');
  const res = JSON.parse(execFileSync(path.join(project, '.venv', 'bin', 'python'), ['-c', script], { encoding: 'utf8' })) as Record<string, boolean | string>;
  for (const c of py) if (res[c.id] !== true) reject(c, res[c.id] === false ? 'the bad name exists (or the call binds) in the installed version' : `probe failed: ${String(res[c.id])}`);
}
{
  const env = { ...process.env, GOFLAGS: '-mod=mod', GOPROXY: 'off', GOFLAGS_: '' };
  for (const c of spec.cases.filter((x) => x.ecosystem === 'go')) {
    const build = (variant: 'cases' | 'valid'): boolean => spawnSync('go', ['build', '-o', os.devNull, `./${path.posix.dirname(casePath(c, variant))}`], { cwd: project, env, encoding: 'utf8' }).status === 0;
    if (!build('valid')) reject(c, 'go build rejects the good line');
    else if (build('cases')) reject(c, 'go build accepts the bad line');
  }
}
{
  const jars: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.jar') && jars.push(path.join(d, e.name));
  };
  walk(process.env.GROUNDWORK_M2);
  for (const c of spec.cases.filter((x) => x.ecosystem === 'maven')) {
    const javac = (variant: 'cases' | 'valid'): { ok: boolean; lines: number[] } => {
      const file = path.join(project, casePath(c, variant));
      const r = spawnSync('javac', ['-proc:none', '-cp', jars.join(path.delimiter), '-d', path.join(project, 'out', c.id, variant), file], { encoding: 'utf8' });
      return { ok: r.status === 0, lines: [...(r.stderr ?? '').matchAll(/C\.java:(\d+): error/g)].map((m) => Number(m[1])) };
    };
    if (!javac('valid').ok) reject(c, 'javac rejects the good line');
    else {
      const bad = javac('cases');
      if (bad.ok || !bad.lines.includes(badLines.get(c.id)!)) reject(c, 'javac accepts the bad line');
    }
  }
}
rmSync(path.join(project, 'out'), { recursive: true, force: true });

// ---- network guard ----
let network = 0;
const realConnect = net.Socket.prototype.connect;
const realLookup = dns.lookup;
const realFetch = globalThis.fetch;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  network++;
  return (realConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof realConnect;
(dns as { lookup: unknown }).lookup = (...args: unknown[]) => {
  network++;
  return (realLookup as (...a: unknown[]) => unknown)(...args);
};
globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
  network++;
  return realFetch(...args);
}) as typeof fetch;

// ---- Groundwork ----
await initSqlBackend();
async function open(root: string) {
  const config = loadConfig(root);
  await refreshIndex(root, { config });
  return { config, db: openDb(indexDbPath(root), { readonly: true }) };
}
rmSync(path.join(project, '.groundwork', 'deps'), { recursive: true, force: true });
const { db, config } = await open(project);
const checker = new DependencyChecker(db, project, config);
const valid = spec.cases.filter((c) => !invalid.has(c.id));
const rows: { id: string; ecosystem: string; kind: string; caught: boolean; blocking: boolean; message: string | null }[] = [];
const falseBlocks: { file: string; line: number; message: string }[] = [];
for (const c of valid) {
  const rel = casePath(c, 'cases');
  const r = await checker.check(rel);
  const hit = r.findings.filter((f) => f.line === badLines.get(c.id));
  for (const f of r.findings) if (f.blocking && f.line !== badLines.get(c.id)) falseBlocks.push({ file: rel, line: f.line, message: f.message });
  rows.push({ id: c.id, ecosystem: c.ecosystem, kind: c.kind, caught: hit.length > 0, blocking: hit.some((f) => f.blocking), message: hit[0]?.message ?? null });
}
const seededChecks = checker.stats.checks;

// Accepted code: good-only variants and the control corpora inside the project.
const listed = (root: string, args: string[]): string[] => execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter((f) => /\.(m?[jt]sx?|py|go|java)$/.test(f));
const corpora: { name: string; files: number; checks: number; falseBlocks: number; warnings: number }[] = [];
async function control(name: string, c: DependencyChecker, root: string, files: string[]): Promise<void> {
  const before = c.stats.checks;
  let blocks = 0;
  let warnings = 0;
  for (const file of files) {
    for (const f of (await c.check(file)).findings) {
      if (f.blocking) {
        blocks++;
        falseBlocks.push({ file: `${name}: ${file}`, line: f.line, message: f.message });
      } else warnings++;
    }
  }
  corpora.push({ name, files: files.length, checks: c.stats.checks - before, falseBlocks: blocks, warnings });
}
await control('good-only variants', checker, project, valid.map((c) => casePath(c, 'valid')));
await control('requests, click, jinja2 sources', checker, project, listed(project, ['control/py']));
await control('uuid, pflag sources', checker, project, listed(project, ['control/go']));
await control('commons-text sources', checker, project, listed(project, ['control/java']));
db.close();
{
  const own = await open(repo);
  await control('Groundwork src, scripts, test', new DependencyChecker(own.db, repo, { ...own.config, deps: { ...own.config.deps, cache: false } }), repo, listed(repo, ['src', 'scripts', 'test']));
  own.db.close();
}

// ---- index time on >= 500 packages ----
rmSync(path.join(timing, '.groundwork', 'deps'), { recursive: true, force: true });
const t = await open(timing);
const cold0 = performance.now();
const cold = await new DependencyChecker(t.db, timing, t.config).buildAll();
const coldMs = Math.round(performance.now() - cold0);
const warm0 = performance.now();
const warm = await new DependencyChecker(t.db, timing, t.config).buildAll();
const warmMs = Math.round(performance.now() - warm0);
t.db.close();

net.Socket.prototype.connect = realConnect;
(dns as { lookup: unknown }).lookup = realLookup;
globalThis.fetch = realFetch;

// ---- result ----
const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 1000) / 10 : 0);
const caught = rows.filter((r) => r.caught).length;
const group = (key: 'ecosystem' | 'kind'): Record<string, { cases: number; caught: number; recallPct: number }> => {
  const out: Record<string, { cases: number; caught: number; recallPct: number }> = {};
  for (const r of rows) {
    const g = (out[r[key]] ??= { cases: 0, caught: 0, recallPct: 0 });
    g.cases++;
    if (r.caught) g.caught++;
  }
  for (const g of Object.values(out)) g.recallPct = pct(g.caught, g.cases);
  return out;
};
const byEcosystem = group('ecosystem');
const acceptedChecks = corpora.reduce((a, c) => a + c.checks, 0) + seededChecks - rows.length;
const falsePer100 = acceptedChecks ? Math.round((falseBlocks.length / acceptedChecks) * 10000) / 100 : 0;
const setValid = valid.length >= 60 && (['npm', 'pypi', 'go', 'maven'] as const).every((e) => (byEcosystem[e]?.cases ?? 0) >= 8);
const gates = {
  validSet: setValid,
  recall: pct(caught, rows.length) >= 80,
  falseBlocks: falsePer100 <= 1,
  indexTime: cold.packages >= 500 && coldMs < 30000,
  network: network === 0,
};
const result = {
  preregistration: 'bench/deps/PREREGISTRATION.md',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  node: process.version,
  pass: Object.values(gates).every(Boolean),
  gates,
  cases: { total: spec.cases.length, valid: valid.length, excluded: [...invalid].map(([id, reason]) => ({ id, reason })) },
  recall: { caught, of: rows.length, pct: pct(caught, rows.length), blockingShareOfCaughtPct: pct(rows.filter((r) => r.blocking).length, caught), byEcosystem, byKind: group('kind') },
  falseBlocks: { count: falseBlocks.length, acceptedChecks, per100: falsePer100, corpora, list: falseBlocks.slice(0, 50) },
  index: { packages: cold.packages, byEcosystem: cold.byEcosystem, fullyListed: cold.closed, open: cold.open, coldMs, warmMs, warmFromCache: warm.cached },
  network: { calls: network },
  misses: rows.filter((r) => !r.caught).map((r) => r.id),
  rows,
};
const outDir = path.join(repo, 'bench', 'deps', 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 1) + '\n');
const bad = new Map(spec.cases.map((c) => [c.id, c.bad]));
const md = [
  '# Dependency-hallucination gate: result',
  '',
  `Protocol: [PREREGISTRATION.md](../PREREGISTRATION.md). Commit \`${result.commit.slice(0, 10)}\`, Node ${process.version}. Raw data: [result.json](result.json).`,
  '',
  `**Gate: ${result.pass ? 'PASS' : 'FAIL'}**`,
  '',
  '| Metric | Result | Threshold | |',
  '| --- | --- | --- | --- |',
  `| Valid cases | ${valid.length} of ${spec.cases.length} | ≥ 60, ≥ 8 per ecosystem | ${gates.validSet ? 'pass' : 'fail'} |`,
  `| Recall | ${caught}/${rows.length} (${result.recall.pct}%) | ≥ 80% | ${gates.recall ? 'pass' : 'fail'} |`,
  `| False blocks | ${falseBlocks.length} in ${acceptedChecks} accepted checks (${falsePer100} per 100) | ≤ 1 per 100 | ${gates.falseBlocks ? 'pass' : 'fail'} |`,
  `| Index time, cold | ${(coldMs / 1000).toFixed(1)} s for ${cold.packages} packages | < 30 s for ≥ 500 | ${gates.indexTime ? 'pass' : 'fail'} |`,
  `| Network calls | ${network} | 0 | ${gates.network ? 'pass' : 'fail'} |`,
  '',
  `Of the caught cases, ${result.recall.blockingShareOfCaughtPct}% block; the rest are warnings. Warm index time: ${(warmMs / 1000).toFixed(2)} s (${warm.cached} surfaces from the per-version cache). Of the ${cold.packages} timed packages, ${cold.closed} could be fully listed and ${cold.open} are left open (unchecked).`,
  '',
  '## Recall by ecosystem and kind',
  '',
  '| Group | Caught | Recall |',
  '| --- | --- | --- |',
  ...Object.entries({ ...byEcosystem, ...result.recall.byKind }).map(([k, g]) => `| ${k} | ${g.caught}/${g.cases} | ${g.recallPct}% |`),
  '',
  '## Accepted code checked for false blocks',
  '',
  '| Corpus | Files | Dependency checks | False blocks | Warnings |',
  '| --- | --- | --- | --- | --- |',
  ...corpora.map((c) => `| ${c.name} | ${c.files} | ${c.checks} | ${c.falseBlocks} | ${c.warnings} |`),
  '',
  ...(falseBlocks.length ? ['## False blocks', '', ...falseBlocks.slice(0, 50).map((f) => `- \`${f.file}:${f.line}\` ${f.message}`), ''] : []),
  '## Misses',
  '',
  ...(result.misses.length ? result.misses.map((id) => `- \`${id}\`: \`${bad.get(id)}\``) : ['None.']),
  '',
  '## Excluded by the toolchain check',
  '',
  ...(invalid.size ? [...invalid].map(([id, why]) => `- \`${id}\`: \`${bad.get(id)}\` (${why})`) : ['None.']),
  '',
].join('\n');
writeFileSync(path.join(outDir, 'RESULTS.md'), md);
console.log(md);
process.exitCode = result.pass ? 0 : 1;

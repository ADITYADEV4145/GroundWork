import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../src/config/load.js';
import { changedFromGit, verifyChanged, type ChangedFile, type VerifyResult } from '../src/grounding/index.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { typeCheck, type TypeCheckResult } from '../src/types/index.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const data = path.join(project, 'bench/types');
const script = fileURLToPath(import.meta.url);
const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
interface Mutation { id: string; repo: string; operator: string; file: string; line: number; before: string; after: string }
interface Manifest {
  version: number; seed: number; sourceCommit: string; cleanCommits: { commit: string; parent: string }[];
  sourceHashes: Record<string, Record<string, string>>; mutations: Mutation[];
  compilers: { typescript: string; pyright: string };
}
interface Block {
  file: string; line: number; name: string; message: string; code: string | number;
  source: 'grounding' | 'types'; typeConfirmed?: boolean;
}
interface Evaluation {
  A: Block[]; B: Block[]; grounding: VerifyResult[]; types: TypeCheckResult | null;
  complete: boolean; errors: string[]; ms: number;
}
interface SeedRow extends Evaluation { mutation: Mutation; caughtA: boolean; caughtB: boolean }
interface CleanRow extends Evaluation { id: string; commit?: string; parent?: string; changed: ChangedFile[] }
interface Timing { mode: 'cold' | 'warm'; ms: number; result: TypeCheckResult }
interface Timings { samples: Timing[]; warmup: Timing | null; errors: string[] }

export function registeredManifest(directory = data): { manifest: Manifest; hash: string } {
  const registration = readFileSync(path.join(directory, 'PREREGISTRATION.md'), 'utf8');
  const expected = /Manifest SHA256: `([a-f0-9]{64})`/.exec(registration)?.[1];
  const bytes = readFileSync(path.join(directory, 'mutations.json'));
  if (!expected || sha(bytes) !== expected) throw new Error('Refusing benchmark: mutations.json SHA256 differs from preregistration');
  const manifest = JSON.parse(bytes.toString()) as Manifest;
  if (manifest.version !== 1 || manifest.mutations.length < 60 || manifest.mutations.length > 120) throw new Error('Invalid registered manifest');
  return { manifest, hash: expected };
}

const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const config = defaultConfig();
const nameKey = (value: string) => value.replace(/^['"]|['"]$/g, '').replace(/\(.*$/, '').split('.').at(-1) ?? '';
const sameSite = (a: Block, b: Block) => a.file === b.file && a.line === b.line && nameKey(a.name) === nameKey(b.name);
const identity = (b: Block) => JSON.stringify([b.file, b.line, b.name, b.code, b.message.replace(/\s+/g, ' ').trim()]);

export function unionBlocks(grounding: Block[], types: Block[]): Block[] {
  const result = grounding.map((b) => ({ ...b }));
  for (const finding of types) {
    const existing = result.find((b) => b.source === 'grounding' && sameSite(b, finding));
    if (existing) existing.typeConfirmed = true;
    else if (!result.some((b) => identity(b) === identity(finding))) result.push(finding);
  }
  return result;
}

async function evaluate(root: string, changed: ChangedFile[], base: string): Promise<Evaluation> {
  const start = performance.now();
  const row: Evaluation = { A: [], B: [], grounding: [], types: null, complete: true, errors: [], ms: 0 };
  try {
    await refreshIndex(root, { config });
    const db = openDb(indexDbPath(root), { readonly: true });
    try { row.grounding = verifyChanged(db, root, changed, config); }
    finally { db.close(); }
    row.A = row.grounding.flatMap((r) => r.findings).filter((f) => f.blocking).map((f) => ({ file: f.file, line: f.line, name: f.name, message: f.message, code: f.kind, source: 'grounding' }));
  } catch (e) { row.complete = false; row.errors.push(`grounding: ${(e as Error).message}`); }
  try {
    row.types = await typeCheck(root, changed, config, { base, timeoutMs: 4000 });
    for (const language of ['typescript', 'python'] as const) {
      const requested = changed.some((c) => language === 'typescript' ? c.file.endsWith('.ts') : c.file.endsWith('.py'));
      if (requested && row.types.available[language] !== true) { row.complete = false; row.errors.push(`${language}: ${row.types.available[language]}`); }
    }
    if (row.types.timedOut) { row.complete = false; row.errors.push('type timeout'); }
    row.B = unionBlocks(row.A, row.types.findings.filter((f) => f.blocking).map((f) => ({ file: f.file, line: f.line, name: f.name, message: f.message, code: f.code, source: 'types' })));
  } catch (e) { row.complete = false; row.errors.push(`types: ${(e as Error).message}`); row.B = [...row.A]; }
  row.ms = Math.round(performance.now() - start);
  return row;
}

function provision(root: string): void {
  const target = path.join(root, 'node_modules');
  if (existsSync(target)) throw new Error(`Refusing to replace dependencies: ${target}`);
  symlinkSync(path.join(project, 'node_modules'), target, 'dir');
}

function checkout(root: string, commit: string): void {
  git(project, 'clone', '--quiet', '--shared', '--no-checkout', project, root);
  git(root, 'checkout', '--quiet', '--detach', commit);
  provision(root);
}

function reference(repo: string): { source: string; target: string } {
  const python = repo === 'dispatch-desk';
  return { source: `bench/grounding/reference/${repo}.${python ? 'py' : 'ts'}.txt`, target: python ? 'dispatch/workflows.py' : 'src/workflows.ts' };
}

function benchWorkspace(anchor: string, directory: string, repo: string): string {
  const root = path.join(directory, repo);
  cpSync(path.join(anchor, 'bench/grounding/repos', repo), root, { recursive: true });
  provision(root);
  git(root, 'init', '--quiet');
  const files = git(anchor, 'ls-tree', '-r', '--name-only', 'HEAD', '--', `bench/grounding/repos/${repo}/`).split('\n').map((f) => f.slice(`bench/grounding/repos/${repo}/`.length));
  git(root, 'add', '--', ...files);
  commit(root, 'Original grounding repository');
  return root;
}

function commit(root: string, message: string): void {
  git(root, '-c', 'user.name=Benchmark', '-c', 'user.email=benchmark@localhost', 'commit', '--quiet', '-m', message);
}

function assertSources(root: string, expected: Record<string, string>): void {
  for (const [file, hash] of Object.entries(expected)) if (sha(readFileSync(path.join(root, file))) !== hash) throw new Error(`Frozen source differs: ${root}/${file}`);
}

export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]!;
}

async function timingCalls(root: string, mode: 'cold' | 'warm', count: number): Promise<{ samples: Timing[]; warmup: Timing | null }> {
  const file = 'src/util/tokens.ts';
  const original = readFileSync(path.join(root, file), 'utf8');
  const line = original.split('\n').findIndex((s) => s.includes("export const TOKEN_ESTIMATE_METHOD = 'bytes/4'")) + 1;
  if (!line) throw new Error('Frozen timing edit target absent');
  writeFileSync(path.join(root, file), original.replace("TOKEN_ESTIMATE_METHOD = 'bytes/4'", 'TOKEN_ESTIMATE_METHOD = "bytes/4"'));
  const call = async (): Promise<Timing> => {
    const start = performance.now();
    const result = await typeCheck(root, [{ file, ranges: [[line, line]] }], config, { timeoutMs: 4000, base: 'HEAD' });
    return { mode, ms: Number((performance.now() - start).toFixed(3)), result };
  };
  try {
    const warmup = mode === 'warm' ? await call() : null;
    const samples: Timing[] = [];
    for (let i = 0; i < count; i++) samples.push(await call());
    return { samples, warmup };
  } finally { writeFileSync(path.join(root, file), original); }
}

interface Results {
  protocol: string; manifestSha256: string; sourceCommit: string; checkerCommit: string; checkerSourceSha256: string;
  generatedAt: string; environment: Record<string, unknown>; workDirectory: string;
  seeds: SeedRow[]; clean: CleanRow[]; timings: Timings;
  summary: { seeded: { total: number; A: number; B: number }; falseBlocks: { A: number; B: number }; cleanCases: number; complete: boolean; p50: number | null; p95: number | null;
    rules: { moreSeededErrors: boolean; noMoreFalseBlocks: boolean; stopBudget: boolean }; status: 'PASS' | 'FAIL' | 'INCOMPLETE' };
}

export function markdown(results: Results): string {
  const s = results.summary;
  const operators = [...new Set(results.seeds.map((r) => r.mutation.operator))];
  const lines = ['# Type-aware checking gate results', '', '**Deterministic tool-level evaluation, NOT an agent run.**', '',
    `Preregistered manifest SHA256: \`${results.manifestSha256}\`.`,
    `Frozen source/history: \`${results.sourceCommit}\`. Current checker source hash: \`${results.checkerSourceSha256}\`.`, '',
    `## Summary: ${s.status}`, '',
    `- Seeded errors caught as blocking: **A ${s.seeded.A}/${s.seeded.total}; B ${s.seeded.B}/${s.seeded.total}**.`,
    `- Designated-clean blocking findings: **A ${s.falseBlocks.A}; B ${s.falseBlocks.B}**, across ${s.cleanCases} clean cases (${results.clean.filter((c) => c.commit).length} reachable history commits + ${results.clean.filter((c) => !c.commit).length} reference solutions).`,
    `- Stop type-check component, 40 planned samples: **p50 ${s.p50 ?? 'unavailable'} ms; p95 ${s.p95 ?? 'unavailable'} ms**, budget 4000 ms.`,
    `- Complete evaluation coverage: **${s.complete ? 'yes' : 'no'}**.`, '',
    '| Preregistered rule | Result |', '| --- | --- |',
    `| B catches strictly more seeded errors | ${s.rules.moreSeededErrors ? 'PASS' : 'FAIL'} |`,
    `| B false blocks <= A false blocks | ${s.rules.noMoreFalseBlocks ? 'PASS' : 'FAIL'} |`,
    `| Combined Stop type-check p95 <= 4000 ms | ${s.rules.stopBudget ? 'PASS' : 'FAIL'} |`, '',
    '## Seeded errors by operator', '', '| Operator | Mutations | A caught | B caught |', '| --- | ---: | ---: | ---: |'];
  for (const operator of operators) {
    const rows = results.seeds.filter((r) => r.mutation.operator === operator);
    lines.push(`| ${operator} | ${rows.length} | ${rows.filter((r) => r.caughtA).length} | ${rows.filter((r) => r.caughtB).length} |`);
  }
  lines.push('', '## Clean cases and false blocks', '', 'All blocking findings are listed below, including findings already emitted by A. These are designated-clean proxies, not independently certified bug-free programs.', '', '| Case | Changed files | A blocks | B blocks | Complete |', '| --- | ---: | ---: | ---: | --- |');
  for (const row of results.clean) lines.push(`| ${row.id} | ${row.changed.length} | ${row.A.length} | ${row.B.length} | ${row.complete ? 'yes' : 'no'} |`);
  const escape = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  for (const row of results.clean) {
    if (!row.A.length && !row.B.length) continue;
    lines.push('', `### ${row.id}`, '', '| Arm | Location | Source/code | Name | Message |', '| --- | --- | --- | --- | --- |');
    for (const f of row.A) lines.push(`| A (also B) | ${f.file}:${f.line} | ${f.source}/${f.code} | ${escape(f.name)} | ${escape(f.message)} |`);
    for (const f of row.B.filter((b) => !row.A.some((a) => identity(a) === identity(b)))) lines.push(`| B only | ${f.file}:${f.line} | ${f.source}/${f.code} | ${escape(f.name)} | ${escape(f.message)} |`);
  }
  lines.push('', '## Stop type-check timings', '', 'Type component only, not total Stop dispatch, index refresh, or agent latency. Nearest-rank percentiles; no outliers removed.', '', '| Mode | Samples | p50 ms | p95 ms | Timeouts/unavailable |', '| --- | ---: | ---: | ---: | ---: |');
  for (const mode of ['cold', 'warm'] as const) {
    const rows = results.timings.samples.filter((r) => r.mode === mode);
    lines.push(`| ${mode} | ${rows.length} | ${percentile(rows.map((r) => r.ms), 0.5)} | ${percentile(rows.map((r) => r.ms), 0.95)} | ${rows.filter((r) => r.result.timedOut || r.result.available.typescript !== true).length} |`);
  }
  lines.push('', `Warm-up (excluded by preregistration): ${results.timings.warmup?.ms ?? 'unavailable'} ms.`, '', '| Sample | Mode | ms | Timed out |', '| ---: | --- | ---: | --- |');
  results.timings.samples.forEach((r, i) => lines.push(`| ${i + 1} | ${r.mode} | ${r.ms} | ${r.result.timedOut} |`));
  lines.push('', '## Incomplete evaluations / errors', '');
  const incomplete = [...results.seeds.map((r) => ({ id: r.mutation.id, ...r })), ...results.clean].filter((r) => !r.complete);
  for (const row of incomplete) lines.push(`- ${row.id}: ${row.errors.join('; ')}`);
  lines.push(...results.timings.errors.map((e) => `- timing: ${e}`));
  if (!incomplete.length && !results.timings.errors.length) lines.push('None.');
  lines.push('', '## Interpretation and limitations', '',
    '- Only 32 reachable non-merge commits touch tracked TypeScript files; all 32 were frozen and evaluated, per the approved widened rule. No unmerged history was used.',
    '- Historical workspaces use their own source/config but the same currently installed development dependencies, not reconstructed historical installs. Dependency/compiler skew can create diagnostics; no such rows are removed.',
    '- This is a fixed seeded corpus and a designated-clean proxy, not a population precision estimate or agent success evaluation. A failure is published without tuning the checker.',
    '- Types remain Stop-only by default (`types.postToolHook: false`). No PostToolUse latency claim is made, and this evaluation does not authorize enabling that hook.',
    '- Post-registration checker fixes: none. The preregistered Stop-output filter fix affects presentation only, not either arm\'s blocking decisions.',
    `- Environment: ${JSON.stringify(results.environment)}.`,
    '- Raw per-mutation findings, availability, clean cases, warm-up and samples: `results.json`.', '');
  return lines.join('\n');
}

function sourceHash(): string {
  const walk = (dir: string): string[] => readdirSync(path.join(project, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  return sha(walk('src').map((file) => `${file}\0${sha(readFileSync(path.join(project, file)))}`).join('\n'));
}

export async function runBenchmark(): Promise<Results> {
  const { manifest, hash } = registeredManifest();
  if (git(project, 'rev-parse', '--is-shallow-repository') === 'true') throw new Error('Unshallow history before evaluation');
  for (const row of manifest.cleanCommits) if (git(project, 'rev-list', '--parents', '-n', '1', row.commit) !== `${row.commit} ${row.parent}`) throw new Error(`Historical parent differs: ${row.commit}`);
  const workParent = path.join(os.homedir(), 'work');
  if (!existsSync(workParent)) throw new Error(`Persistent workspace parent absent: ${workParent}`);
  const work = mkdtempSync(path.join(workParent, 'gw-types-gate-'));
  const anchor = path.join(work, 'groundwork');
  checkout(anchor, manifest.sourceCommit);
  const environment = { node: process.version, typescript: (createRequire(path.join(anchor, 'package.json'))('typescript') as { version: string }).version,
    pyright: execFileSync('pyright', ['--version'], { encoding: 'utf8' }).trim(), platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model };
  if (environment.typescript !== manifest.compilers.typescript || environment.pyright !== 'pyright 1.1.414') throw new Error(`Registered compiler versions differ: ${JSON.stringify(environment)}`);
  await initSqlBackend();
  const roots = new Map<string, string>([['groundwork', anchor]]);
  const clean: CleanRow[] = [];
  const seeds: SeedRow[] = [];
  const checkpoint = () => writeFileSync(path.join(work, 'progress.json'), JSON.stringify({ seeds, clean }, null, 2) + '\n');
  for (const repo of ['customer-desk', 'parcel-ops', 'dispatch-desk']) {
    const root = benchWorkspace(anchor, work, repo);
    roots.set(repo, root);
    const ref = reference(repo);
    if (!existsSync(path.join(root, ref.target))) throw new Error(`Reference target absent: ${repo}/${ref.target}`);
    cpSync(path.join(anchor, ref.source), path.join(root, ref.target));
    const changed = changedFromGit(root);
    clean.push({ id: `reference/${repo}`, changed, ...await evaluate(root, changed, 'HEAD') });
    checkpoint();
    git(root, 'add', '--', ref.target); commit(root, 'Reference workflow baseline');
  }
  for (const [repo, root] of roots) assertSources(root, manifest.sourceHashes[repo]!);
  for (const mutation of manifest.mutations) {
    const root = roots.get(mutation.repo)!;
    const file = path.join(root, mutation.file);
    const original = readFileSync(file, 'utf8');
    const lines = original.split('\n');
    if (lines[mutation.line - 1] !== mutation.before) throw new Error(`Frozen before-line differs: ${mutation.id}`);
    lines[mutation.line - 1] = mutation.after;
    writeFileSync(file, lines.join('\n'));
    try {
      const result = await evaluate(root, [{ file: mutation.file, ranges: [[mutation.line, mutation.line]] }], 'HEAD');
      seeds.push({ mutation, ...result, caughtA: result.A.some((f) => f.line === mutation.line), caughtB: result.B.some((f) => f.line === mutation.line) });
      console.log(`${mutation.id} ${mutation.repo}/${mutation.operator}: A=${seeds.at(-1)!.caughtA} B=${seeds.at(-1)!.caughtB} complete=${result.complete}`);
      checkpoint();
    } finally { writeFileSync(file, original); }
  }
  for (const row of manifest.cleanCommits) {
    const root = path.join(work, `history-${row.commit.slice(0, 12)}`);
    checkout(root, row.commit);
    const changed = changedFromGit(root, row.parent).filter((c) => c.file.endsWith('.ts'));
    clean.push({ id: `history/${row.commit}`, commit: row.commit, parent: row.parent, changed, ...await evaluate(root, changed, row.parent) });
    console.log(`history ${row.commit}: A=${clean.at(-1)!.A.length} B=${clean.at(-1)!.B.length} complete=${clean.at(-1)!.complete}`);
    checkpoint();
  }
  const timings: Timings = { samples: [], warmup: null, errors: [] };
  const sample = (mode: 'cold' | 'warm', count: number) => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', script, '--timing-child', anchor, mode, String(count)], { cwd: project, encoding: 'utf8', timeout: count * 6000 + 10000, maxBuffer: 16 << 20 });
    return JSON.parse(output) as { samples: Timing[]; warmup: Timing | null };
  };
  for (let i = 0; i < 20; i++) {
    try { timings.samples.push(...sample('cold', 1).samples); }
    catch (e) { timings.errors.push(`cold ${i + 1}: ${(e as Error).message}`); }
  }
  try { const warm = sample('warm', 20); timings.samples.push(...warm.samples); timings.warmup = warm.warmup; }
  catch (e) { timings.errors.push(`warm: ${(e as Error).message}`); }
  const p50 = percentile(timings.samples.map((r) => r.ms), 0.5), p95 = percentile(timings.samples.map((r) => r.ms), 0.95);
  const complete = seeds.length === manifest.mutations.length && clean.length === manifest.cleanCommits.length + 3 && [...seeds, ...clean].every((r) => r.complete)
    && timings.samples.length === 40 && !timings.errors.length && [...timings.samples, ...(timings.warmup ? [timings.warmup] : [])].every((t) => !t.result.timedOut && t.result.available.typescript === true);
  const seeded = { total: seeds.length, A: seeds.filter((r) => r.caughtA).length, B: seeds.filter((r) => r.caughtB).length };
  const falseBlocks = { A: clean.reduce((n, r) => n + r.A.length, 0), B: clean.reduce((n, r) => n + r.B.length, 0) };
  const rules = { moreSeededErrors: seeded.B > seeded.A, noMoreFalseBlocks: falseBlocks.B <= falseBlocks.A, stopBudget: p95 !== null && p95 <= 4000 };
  const results: Results = { protocol: 'deterministic tool-level, not an agent run', manifestSha256: hash, sourceCommit: manifest.sourceCommit,
    checkerCommit: git(project, 'rev-parse', 'HEAD'), checkerSourceSha256: sourceHash(), generatedAt: new Date().toISOString(), environment, workDirectory: work,
    seeds, clean, timings, summary: { seeded, falseBlocks, cleanCases: clean.length, complete, p50, p95, rules, status: !complete ? 'INCOMPLETE' : Object.values(rules).every(Boolean) ? 'PASS' : 'FAIL' } };
  const out = path.join(data, 'results');
  if (existsSync(path.join(out, 'results.json'))) {
    const archive = path.join(out, `previous-${Date.now()}`); mkdirSync(archive);
    cpSync(path.join(out, 'results.json'), path.join(archive, 'results.json'));
    cpSync(path.join(out, 'RESULTS.md'), path.join(archive, 'RESULTS.md'));
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  writeFileSync(path.join(out, 'RESULTS.md'), markdown(results));
  console.log(markdown(results).split('## Seeded errors by operator')[0]);
  return results;
}

if (path.resolve(process.argv[1] ?? '') === script) {
  try {
    registeredManifest();
    if (process.argv[2] === '--timing-child') console.log(JSON.stringify(await timingCalls(process.argv[3]!, process.argv[4] as 'cold' | 'warm', Number(process.argv[5]))));
    else { const result = await runBenchmark(); if (result.summary.status !== 'PASS') process.exitCode = 1; }
  } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
}

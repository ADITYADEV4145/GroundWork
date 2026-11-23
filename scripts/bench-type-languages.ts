/**
 * Compiled-language type-checking gate (Go, Java, Rust, C#). Dev-only: `setup` and the per-case
 * dependency restore use the network; the checker under test never does.
 *   node --import tsx scripts/bench-type-languages.ts setup | generate | run --part cases|latency [--language go] | call <root> <file> <line>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '../src/config/load.js';
import { verifyChanged, type ChangedFile } from '../src/grounding/index.js';
import { refreshIndex } from '../src/index/refresh.js';
import { indexDbPath } from '../src/index/store.js';
import { openDb } from '../src/store/db.js';
import { typeCheck, type TypeCheckResult } from '../src/types/index.js';
import { unionBlocks } from './bench-types.js';
import {
  EXTENSION, GATE, LANGUAGES, OPERATORS, cache, candidates, cleanCases, clonePath, data, decide, git, percentile, productFile, project, registry, select, sha,
  type CleanCase, type Lang, type LanguageSummary, type Manifest, type Mutation, type Repository,
} from './type-languages-lib.js';

const script = fileURLToPath(import.meta.url);
const config = defaultConfig();
const option = (name: string) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const manifestPath = path.join(data, option('--manifest') ?? 'manifest.json');
/** The preregistered budget. `--budget-ms` or `--ids` make an exploratory run, which is never a gate result. */
const BUDGET_MS = 4000;
const budgetMs = Number(option('--budget-ms') ?? BUDGET_MS);
const ids = option('--ids')?.split(',').filter(Boolean) ?? null;
const exploratory = budgetMs !== BUDGET_MS || ids !== null;
const dotnetHome = path.join(os.homedir(), '.dotnet');
if (existsSync(path.join(dotnetHome, 'dotnet')) && !(process.env.PATH ?? '').split(path.delimiter).includes(dotnetHome)) process.env.PATH = `${process.env.PATH}${path.delimiter}${dotnetHome}`;

const tracked = (root: string, language: Lang) => git(root, 'ls-files', '--', `*${EXTENSION[language]}`).split('\n').filter(Boolean);
const quiet = (binary: string, args: string[], cwd: string, timeout = 900_000) => spawnSync(binary, args, { cwd, stdio: 'ignore', timeout });
function nearest(root: string, file: string, test: (name: string) => boolean): string | null {
  for (let d = path.dirname(path.join(root, file)); ; d = path.dirname(d)) {
    const name = git(root, 'ls-files', '--', path.relative(root, d) || '.').split('\n').map((f) => path.relative(d, path.join(root, f))).find((f) => !f.includes('/') && test(f));
    if (name) return path.join(d, name);
    if (d === root || path.relative(root, d).startsWith('..')) return null;
  }
}

/** Network step: fetch the dependencies the checked-out tree needs for `files`. Never part of a measured check. */
function restore(root: string, language: Lang, files: string[]): void {
  if (language === 'go') quiet('go', ['mod', 'download'], root);
  if (language === 'rust') quiet('cargo', ['fetch'], root);
  if (language === 'csharp') for (const p of new Set(files.map((f) => nearest(root, f, (n) => n.endsWith('.csproj'))).filter((p): p is string => !!p))) quiet('dotnet', ['restore', p, '-v:q', '-p:NuGetAudit=false'], path.dirname(p));
}
interface Block { file: string; line: number; name: string; message: string; code: string | number; source: 'grounding' | 'types'; typeConfirmed?: boolean }
interface Evaluation { A: Block[]; B: Block[]; types: TypeCheckResult | null; complete: boolean; checked: boolean; timedOut: boolean; errors: string[]; ms: number }
async function evaluate(root: string, language: Lang, changed: ChangedFile[], base: string): Promise<Evaluation> {
  const row: Evaluation = { A: [], B: [], types: null, complete: true, checked: true, timedOut: false, errors: [], ms: 0 };
  const nothing = changed.every((c) => c.ranges !== null && !c.ranges.length);
  try {
    await refreshIndex(root, { config });
    const db = openDb(indexDbPath(root), { readonly: true });
    try { row.A = verifyChanged(db, root, changed, config).flatMap((r) => r.findings).filter((f) => f.blocking).map((f) => ({ file: f.file, line: f.line, name: f.name, message: f.message, code: f.kind, source: 'grounding' })); }
    finally { db.close(); }
  } catch (e) { row.complete = false; row.errors.push(`grounding: ${(e as Error).message}`); }
  const start = performance.now();
  try {
    row.types = await typeCheck(root, changed, config, { base, timeoutMs: budgetMs });
    if (row.types.timedOut) { row.checked = false; row.timedOut = true; row.errors.push('type timeout'); }
    else if (row.types.available[language] !== true && !nothing) { row.checked = false; row.errors.push(`${language}: ${row.types.available[language]}`); }
    row.B = unionBlocks(row.A, row.types.findings.filter((f) => f.blocking).map((f) => ({ file: f.file, line: f.line, name: f.name, message: f.message, code: f.code, source: 'types' })));
  } catch (e) { row.complete = false; row.checked = false; row.errors.push(`types: ${(e as Error).message}`); row.B = [...row.A]; }
  row.ms = Math.round(performance.now() - start);
  return row;
}
const WARM_ERROR: Record<Lang, string | null> = { go: 'var _ = gwWarmUndefined', rust: 'const _: () = gw_warm_undefined();', java: null, csharp: 'class GwWarm { object x = GwWarmUndefined; }' };
/**
 * Untimed checker calls on the unedited tree, then once with a throwaway error appended: the state of a session in which
 * GroundWork has already checked these files and has already compared one error against the base text.
 */
async function warmChecker(root: string, language: Lang, files: string[]): Promise<void> {
  for (const file of files) {
    const target = path.join(root, file);
    if (!existsSync(target)) continue;
    const original = readFileSync(target, 'utf8'), lines = original.split('\n').length;
    try {
      // The whole file, so every build the file is part of (Rust test targets included) is warm.
      await typeCheck(root, [{ file, ranges: null }], config, { base: 'HEAD', timeoutMs: 900_000 });
      const error = WARM_ERROR[language];
      if (!error) continue;
      writeFileSync(target, `${original}${original.endsWith('\n') ? '' : '\n'}${error}\n`);
      await typeCheck(root, [{ file, ranges: [[lines, lines + 1]] }], config, { base: 'HEAD', timeoutMs: 900_000 });
    } catch { /* recorded by the measured call */ } finally { writeFileSync(target, original); }
  }
}

function checkout(root: string, commit: string): void {
  git(root, 'checkout', '--quiet', '--force', '--detach', commit);
  git(root, 'clean', '-fdq');
}
function changedLines(root: string, parent: string, files: string[]): ChangedFile[] {
  return files.map((file) => {
    const ranges: [number, number][] = [];
    for (const m of git(root, 'diff', '--no-renames', '-U0', parent, '--', file).matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (count > 0) ranges.push([Number(m[1]), Number(m[1]) + count - 1]);
    }
    return { file, ranges };
  });
}

function setup(): void {
  mkdirSync(cache, { recursive: true });
  for (const repo of registry.repositories) {
    const clone = clonePath(repo);
    if (!existsSync(clone)) git(cache, 'clone', '--quiet', '--no-checkout', repo.url, clone);
    try { git(clone, 'cat-file', '-e', `${repo.commit}^{commit}`); } catch { git(clone, 'fetch', '--quiet', 'origin', repo.commit); }
    checkout(clone, repo.commit);
    appendFileSync(path.join(clone, '.git/info/exclude'), '\n.groundwork/\n');
    restore(clone, repo.language, tracked(clone, repo.language));
    console.log(`ready ${repo.id} ${git(clone, 'rev-parse', 'HEAD')}`);
  }
}

/** `--seed`, `--skip-commits` and `--language` draw a second set from the same repositories: other seeded lines, and the commits before the first set's. */
function generate(): void {
  const seed = Number(option('--seed') ?? registry.seed), skip = Number(option('--skip-commits') ?? 0), only = option('--language');
  const repositories = registry.repositories.filter((r) => !only || r.language === only);
  const manifest: Manifest = { version: 1, seed, repositories, mutations: [], clean: [], sourceHashes: {}, timing: {} };
  for (const repo of repositories) {
    const root = clonePath(repo);
    checkout(root, repo.commit);
    const files = tracked(root, repo.language);
    const mutations = select(seed, candidates(repo, root, files));
    manifest.mutations.push(...mutations);
    manifest.sourceHashes[repo.id] = Object.fromEntries([...new Set(mutations.map((m) => m.file))].sort().map((f) => [f, sha(readFileSync(path.join(root, f)))]));
    manifest.clean.push(...cleanCases(seed, repo, root, skip));
    if (repo.latency) {
      const eligible = files.filter((f) => productFile(repo.language, f) && readFileSync(path.join(root, f), 'utf8').split('\n').length >= 200);
      const file = eligible.sort((a, b) => sha(`${seed}:timing:${a}`).localeCompare(sha(`${seed}:timing:${b}`)))[0]!;
      const text = readFileSync(path.join(root, file), 'utf8');
      manifest.timing[repo.id] = { file, line: text.split('\n').length - (text.endsWith('\n') ? 0 : -1), sha256: sha(text), languageLines: files.reduce((n, f) => n + readFileSync(path.join(root, f), 'utf8').split('\n').length, 0) };
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  for (const language of LANGUAGES.filter((l) => !only || l === only)) console.log(language, 'mutations', manifest.mutations.filter((m) => m.language === language).length, 'clean', manifest.clean.filter((c) => c.language === language).length);
  console.log('manifest sha256', sha(readFileSync(manifestPath)));
}

/** A manifest is registered when the preregistration names its SHA256 after its file name. */
export function registeredManifest(directory = data, name = 'manifest.json', preregistration = 'PREREGISTRATION.md'): { manifest: Manifest; hash: string } {
  const bytes = readFileSync(path.join(directory, name));
  const text = readFileSync(path.join(directory, preregistration), 'utf8');
  const registered = name === 'manifest.json' && preregistration === 'PREREGISTRATION.md'
    ? [/Manifest SHA256: `([a-f0-9]{64})`/.exec(text)?.[1]]
    : [...text.matchAll(/`([\w.-]+\.json)` SHA256: `([a-f0-9]{64})`/g)].filter((m) => m[1] === name).map((m) => m[2]);
  if (!registered.includes(sha(bytes))) throw new Error(`Refusing benchmark: ${name} SHA256 differs from preregistration`);
  return { manifest: JSON.parse(bytes.toString()) as Manifest, hash: sha(bytes) };
}

interface SeedRow extends Evaluation { mutation: Mutation; caughtA: boolean; caughtB: boolean }
interface CleanRow extends Evaluation { case: CleanCase; changed: ChangedFile[] }
interface Timing { mode: 'cold' | 'warm'; ms: number; result: TypeCheckResult }
interface LanguageResult { language: Lang; seeds: SeedRow[]; clean: CleanRow[]; timings: Timing[]; warmup: Timing | null; timingErrors: string[]; init: { ms: number; status: number | null }[]; summary: LanguageSummary }

const TIMING_LINE = '// groundwork timing edit';
async function timedCall(root: string, file: string, line: number, mode: 'cold' | 'warm'): Promise<Timing> {
  const start = performance.now();
  const result = await typeCheck(root, [{ file, ranges: [[line, line]] }], config, { timeoutMs: BUDGET_MS, base: 'HEAD' });
  return { mode, ms: Number((performance.now() - start).toFixed(3)), result };
}

type Part = 'cases' | 'latency';
async function runLanguage(language: Lang, manifest: Manifest, part: Part): Promise<Omit<LanguageResult, 'summary'>> {
  const result: Omit<LanguageResult, 'summary'> = { language, seeds: [], clean: [], timings: [], warmup: null, timingErrors: [], init: [] };
  const repos = manifest.repositories.filter((r) => r.language === language);
  for (const repo of repos) {
    const root = clonePath(repo);
    checkout(root, repo.commit);
    for (const [file, hash] of Object.entries(manifest.sourceHashes[repo.id] ?? {})) if (sha(readFileSync(path.join(root, file))) !== hash) throw new Error(`Frozen source differs: ${repo.id}/${file}`);
    const mutations = part === 'cases' ? manifest.mutations.filter((m) => m.repo === repo.id && (!ids || ids.includes(m.id))) : [];
    const files = [...new Set(mutations.map((m) => m.file))];
    restore(root, language, files);
    for (const mutation of mutations) {
      // Per case, as registered: restoring the previous seed leaves its file newer than the compiler's caches.
      await warmChecker(root, language, [mutation.file]);
      const target = path.join(root, mutation.file);
      const original = readFileSync(target, 'utf8');
      const lines = original.split('\n');
      if (lines[mutation.line - 1] !== mutation.before) throw new Error(`Frozen line differs: ${mutation.id}`);
      lines[mutation.line - 1] = mutation.after;
      writeFileSync(target, lines.join('\n'));
      try {
        const row = await evaluate(root, language, [{ file: mutation.file, ranges: [[mutation.line, mutation.line]] }], 'HEAD');
        const on = (b: Block) => b.file === mutation.file && b.line === mutation.line;
        result.seeds.push({ ...row, mutation, caughtA: row.A.some(on), caughtB: row.B.some(on) });
      } finally { writeFileSync(target, original); }
      console.log(`seed ${mutation.id} ${result.seeds.at(-1)!.caughtA ? 'A' : '-'}${result.seeds.at(-1)!.caughtB ? 'B' : '-'} ${result.seeds.at(-1)!.errors.join('; ')}`);
    }
    for (const item of part === 'cases' ? manifest.clean.filter((c) => c.repo === repo.id && (!ids || ids.includes(c.id))) : []) {
      checkout(root, item.commit); restore(root, language, item.files);
      checkout(root, item.parent); restore(root, language, item.files); await warmChecker(root, language, item.files);
      git(root, 'checkout', '--quiet', '--force', item.commit, '--', '.');
      restore(root, language, item.files);
      // The case is the commit's whole tree against its parent, with the commit's files as an uncommitted change.
      const changed = changedLines(root, item.parent, item.files);
      const row = await evaluate(root, language, changed, item.parent);
      result.clean.push({ ...row, case: item, changed });
      console.log(`clean ${item.id} A${row.A.length} B${row.B.length} ${row.errors.join('; ')}`);
    }
    if (!repo.latency || part !== 'latency') continue;
    checkout(root, repo.commit);
    const timing = manifest.timing[repo.id]!;
    const target = path.join(root, timing.file);
    const original = readFileSync(target, 'utf8');
    if (sha(original) !== timing.sha256) throw new Error(`Frozen timing target differs: ${repo.id}`);
    restore(root, language, [timing.file]); await warmChecker(root, language, [timing.file]);
    try {
      writeFileSync(target, `${original}${original.endsWith('\n') ? '' : '\n'}${TIMING_LINE}\n`);
      for (let i = 0; i < 20; i++) {
        const child = spawnSync(process.execPath, ['--import', 'tsx', script, 'call', root, timing.file, String(timing.line)], { cwd: project, encoding: 'utf8', timeout: 120_000 });
        try { result.timings.push(JSON.parse(child.stdout) as Timing); } catch { result.timingErrors.push(`cold ${i}: ${(child.stderr || child.error?.message || 'no output').slice(0, 300)}`); }
      }
      result.warmup = await timedCall(root, timing.file, timing.line, 'warm');
      for (let i = 0; i < 20; i++) result.timings.push(await timedCall(root, timing.file, timing.line, 'warm'));
    } finally { writeFileSync(target, original); }
    for (let i = 0; i < 3; i++) {
      rmSync(path.join(root, '.groundwork'), { recursive: true, force: true });
      const start = performance.now();
      const child = spawnSync(process.execPath, ['--import', path.join(project, 'node_modules/tsx/dist/loader.mjs'), path.join(project, 'src/cli/main.ts'), 'init'], { cwd: root, stdio: 'ignore', timeout: 600_000 });
      result.init.push({ ms: Math.round(performance.now() - start), status: child.status });
      checkout(root, repo.commit);
    }
  }
  return result;
}
function summarize(language: Lang, manifest: Manifest, result: Omit<LanguageResult, 'summary'>): LanguageResult {
  const repos = manifest.repositories.filter((r) => r.language === language);
  const latency = repos.find((r) => r.latency)!;
  const B = result.seeds.filter((s) => s.caughtB).length, samples = result.timings.map((t) => t.ms);
  // Timeouts are results (a missed seed, an unchecked clean case, a slow sample), not gaps. A gap is a harness error or a toolchain that could not check a seeded file.
  const complete = result.seeds.every((s) => s.complete && (s.checked || s.timedOut)) && result.clean.every((c) => c.complete) && result.timings.length === 40 && !result.timingErrors.length
    && result.timings.every((t) => t.result.timedOut || t.result.available[language] === true) && result.init.length === 3 && result.init.every((i) => i.status === 0);
  const summary = decide({
    seeded: { total: result.seeds.length, A: result.seeds.filter((s) => s.caughtA).length, B, recall: result.seeds.length ? B / result.seeds.length : 0, timedOut: result.seeds.filter((s) => s.timedOut).length },
    cleanCases: result.clean.length, cleanChecked: result.clean.filter((c) => c.checked).length, falseBlocks: { A: result.clean.reduce((n, c) => n + c.A.length, 0), B: result.clean.reduce((n, c) => n + c.B.length, 0) },
    p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), initMs: result.init.map((i) => i.ms), latencyRepo: latency.id, latencyLines: manifest.timing[latency.id]!.languageLines, complete,
  });
  return { ...result, summary };
}

const NAMES: Record<Lang, string> = { go: 'Go', java: 'Java', rust: 'Rust', csharp: 'C#' };
export function markdown(results: { manifestSha256: string; checkerCommit: string; preregistration?: string; environment: Record<string, string>; languages: LanguageResult[] }): string {
  const lines = ['# Compiled-language type-checking gate results', '', '**Deterministic tool-level evaluation, NOT an agent run.** Nothing here supports a speed, token, cost or competitor claim.', '',
    `Preregistered manifest SHA256: \`${results.manifestSha256}\`. Checker commit: \`${results.checkerCommit}\`.`, '',
    '| Language | Status | Seeded caught, grounding only (A) | Seeded caught, with types (B) | Recall B | Seeded timed out | Clean cases (checked) | Blocks on clean A / B | Stop type-check p50 / p95 ms | `gw init` ms (3 runs) | Latency repo lines | Complete |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |'];
  for (const r of results.languages) {
    const s = r.summary;
    lines.push(`| ${NAMES[r.language]} | **${s.status}** | ${s.seeded.A}/${s.seeded.total} | ${s.seeded.B}/${s.seeded.total} | ${(s.seeded.recall * 100).toFixed(1)}% | ${s.seeded.timedOut} | ${s.cleanCases} (${s.cleanChecked}) | ${s.falseBlocks.A} / ${s.falseBlocks.B} | ${s.p50 ?? 'n/a'} / ${s.p95 ?? 'n/a'} | ${s.initMs.join(', ') || 'n/a'} | ${s.latencyLines} (${s.latencyRepo}) | ${s.complete ? 'yes' : 'no'} |`);
  }
  lines.push('', '## Preregistered rules', '', `| Language | Seeded >= 30 and recall >= ${GATE.recall * 100}% | Clean cases >= 100 and blocks <= ${GATE.falseBlocksPer100} per 100 | Clean cases checked >= ${GATE.cleanCoverage * 100}% | Stop type-check p95 <= ${GATE.stopP95Ms} ms | \`gw init\` < ${GATE.initMs / 1000} s | Latency repo >= ${GATE.lines} lines |`, '| --- | --- | --- | --- | --- | --- | --- |');
  const mark = (ok: boolean) => ok ? 'PASS' : 'FAIL';
  for (const r of results.languages) lines.push(`| ${NAMES[r.language]} | ${mark(r.summary.rules.recall)} | ${mark(r.summary.rules.falseBlocks)} | ${mark(r.summary.rules.coverage)} | ${mark(r.summary.rules.stopBudget)} | ${mark(r.summary.rules.init)} | ${mark(r.summary.rules.lines)} |`);
  lines.push('', '## Seeded errors by operator (caught by B / total)', '', `| Language | ${OPERATORS.join(' | ')} |`, `| --- | ${OPERATORS.map(() => '---:').join(' | ')} |`);
  for (const r of results.languages) lines.push(`| ${NAMES[r.language]} | ${OPERATORS.map((o) => { const rows = r.seeds.filter((s) => s.mutation.operator === o); return `${rows.filter((s) => s.caughtB).length}/${rows.length}`; }).join(' | ')} |`);
  lines.push('', '## Missed seeded errors', '');
  for (const r of results.languages) for (const s of r.seeds.filter((x) => !x.caughtB)) lines.push(`- ${NAMES[r.language]} \`${s.mutation.id}\` \`${s.mutation.file}:${s.mutation.line}\`${s.errors.length ? ` (${s.errors.join('; ')})` : ''}: \`${s.mutation.after.trim().slice(0, 140).replace(/`/g, "'")}\``);
  lines.push('', '## Blocking findings on designated-clean commits (B)', '');
  let any = false;
  for (const r of results.languages) for (const c of r.clean) for (const b of c.B) { any = true; lines.push(`- ${NAMES[r.language]} \`${c.case.id}\` \`${b.file}:${b.line}\` ${b.source} ${b.code}: ${b.message.replace(/\s+/g, ' ').slice(0, 200)}`); }
  if (!any) lines.push('None.');
  lines.push('', '## Timeouts, unchecked cases and harness errors', '');
  any = false;
  for (const r of results.languages) {
    const count = new Map<string, number>();
    for (const row of [...r.seeds, ...r.clean]) for (const e of row.errors) count.set(e.replace(/\d+/g, 'N').slice(0, 120), (count.get(e.replace(/\d+/g, 'N').slice(0, 120)) ?? 0) + 1);
    for (const e of r.timingErrors) count.set(e.slice(0, 120), (count.get(e.slice(0, 120)) ?? 0) + 1);
    for (const [e, n] of count) { any = true; lines.push(`- ${NAMES[r.language]}: ${n} x ${e}`); }
  }
  if (!any) lines.push('None.');
  lines.push('', '## Environment', '', ...Object.entries(results.environment).map(([k, v]) => `- ${k}: ${v}`), '', 'Raw rows: `<language>.cases.json` and `<language>.latency.json`. Protocol and limitations: `../PREREGISTRATION.md`.', '');
  return lines.join('\n');
}

async function run(): Promise<void> {
  const { manifest, hash } = registeredManifest(data, option('--manifest'), option('--preregistration'));
  const only = (option('--language') ?? null) as Lang | null;
  const directory = path.join(data, option('--out') ?? 'results');
  mkdirSync(directory, { recursive: true });
  const version = (binary: string, ...args: string[]) => { try { return execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')[0]!; } catch { return 'unavailable'; } };
  const part = option('--part') as Part;
  if (part !== 'cases' && part !== 'latency') throw new Error('--part cases|latency is required');
  if (exploratory) {
    if (part !== 'cases' || !option('--out')) throw new Error('An exploratory run takes --part cases and its own --out directory');
    for (const language of LANGUAGES.filter((l) => !only || l === only)) {
      const file = path.join(directory, `${language}.exploratory.json`);
      if (existsSync(file)) throw new Error(`Refusing to rerun ${language}: result exists`);
      const rows = await runLanguage(language, manifest, part);
      writeFileSync(file, `${JSON.stringify({ exploratory: true, budgetMs, ids, checkerCommit: git(project, 'rev-parse', 'HEAD'), seeds: rows.seeds, clean: rows.clean }, null, 1)}\n`);
    }
    return;
  }
  const partFile = (l: Lang, p: Part) => path.join(directory, `${l}.${p}.json`);
  for (const language of LANGUAGES) {
    if (only && only !== language) continue;
    if (!manifest.repositories.some((r) => r.language === language)) continue;
    if (existsSync(partFile(language, part))) throw new Error(`Refusing to rerun ${language} ${part}: result exists`);
    writeFileSync(partFile(language, part), `${JSON.stringify(await runLanguage(language, manifest, part), null, 1)}\n`);
  }
  const languages = LANGUAGES.filter((l) => existsSync(partFile(l, 'cases')) && existsSync(partFile(l, 'latency'))).map((l) => {
    const cases = JSON.parse(readFileSync(partFile(l, 'cases'), 'utf8')) as LanguageResult, latency = JSON.parse(readFileSync(partFile(l, 'latency'), 'utf8')) as LanguageResult;
    return summarize(l, manifest, { ...latency, seeds: cases.seeds, clean: cases.clean });
  });
  const results = {
    manifestSha256: hash, checkerCommit: git(project, 'rev-parse', 'HEAD'),
    preregistration: option('--preregistration') ?? 'PREREGISTRATION.md',
    environment: { node: process.version, platform: `${os.platform()} ${os.arch()}, ${os.cpus().length} CPUs`, go: version('go', 'version'), javac: version('javac', '-version'), cargo: version('cargo', '--version'), dotnet: version('dotnet', '--version') },
    languages,
  };
  writeFileSync(path.join(directory, 'RESULTS.md'), markdown(results));
  for (const r of languages) console.log(r.language, r.summary.status, JSON.stringify(r.summary.rules));
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  const command = process.argv[2];
  if (command === 'setup') setup();
  else if (command === 'generate') generate();
  else if (command === 'call') { console.log(JSON.stringify(await timedCall(process.argv[3]!, process.argv[4]!, Number(process.argv[5]), 'cold'))); process.exit(0); }
  else if (command === 'run') { await run(); process.exit(0); }
  else { console.error('usage: bench-type-languages.ts setup | generate [--seed n --skip-commits n --language l --manifest file] | run --part cases|latency [--language l] [--manifest file --preregistration file --out dir] [--budget-ms n --ids a,b]'); process.exit(2); }
}

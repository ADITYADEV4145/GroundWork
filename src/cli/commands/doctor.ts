import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Command } from 'commander';
import { ConfigError, loadConfig } from '../../config/load.js';
import { indexStats } from '../../index/query.js';
import { indexDbPath } from '../../index/store.js';
import { initParsers, parse } from '../../lang/parser.js';
import { initSqlBackend, openDb, sqliteBackendAvailable } from '../../store/db.js';
import { readMeta, SCHEMA_VERSION } from '../../store/schema.js';
import { clientStatuses, type ClientStatus } from '../../setup/status.js';
import { onPath } from '../../setup/targets.js';
import type { Language } from '../../types.js';
import { gwPath } from '../../util/paths.js';
import { VERSION } from '../../util/version.js';
import { globalOpts, repoRoot } from '../context.js';
import { emit } from '../output.js';

export interface DoctorCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

const SAMPLES: Record<Language, string> = {
  typescript: 'export function f(a: number): number { return a }',
  tsx: 'export const A = () => <div />',
  javascript: 'export function f(a) { return a }',
  python: 'def f(a):\n    return a\n',
  go: 'package demo\nfunc f(a int) int { return a }\n',
  rust: 'fn f(a: i32) -> i32 { a }',
  java: 'class Demo { int f(int a) { return a; } }',
  csharp: 'class Demo { int F(int a) { return a; } }',
  ruby: 'def f(a)\n  a\nend\n',
};

export interface DoctorOptions {
  /** Overrides for tests and the selftest gate: a fake home directory and PATH lookup. */
  home?: string;
  hasBin?: (bin: string) => boolean;
}

function age(ms: number): string {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return min < 60 ? `${min} min ago` : min < 2880 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
}

function clientCheck(c: ClientStatus): DoctorCheck {
  const kind = c.enforcement === 'hooks' ? 'hooks + MCP' : 'MCP-only (no hooks, nothing is blocked)';
  const name = `client:${c.client}`;
  if (c.state === 'broken') return { name, status: 'fail', detail: `${c.label}: ${c.problem}; fix the file, then run gw install` };
  if (c.state === 'none') return { name, status: c.detected ? 'warn' : 'ok', detail: c.detected ? `${c.label} detected but Groundwork is not installed for it; run gw install` : `${c.label} not detected` };
  // A warning, not a failure: the client may start with a different PATH than this shell.
  if (c.commandFound === false) return { name, status: 'warn', detail: `${c.label}: ${c.problem} from this shell; install it globally or rerun gw install --command <cmd>` };
  if (c.state === 'partial') return { name, status: 'warn', detail: `${c.label}: ${c.enforcement === 'hooks' ? 'hooks or MCP' : 'MCP or skill'} incomplete (${c.problem}); run gw install` };
  return { name, status: 'ok', detail: `${c.label}: ${kind} installed, launches \`${c.command}\`` };
}

export async function runDoctor(root: string, options: DoctorOptions = {}): Promise<DoctorCheck[]> {
  const hasBin = options.hasBin ?? onPath;
  const checks: DoctorCheck[] = [];
  const add = (name: string, status: DoctorCheck['status'], detail: string) => checks.push({ name, status, detail });
  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 22 ? 'ok' : 'fail', `v${process.versions.node}${major >= 22 ? '' : ' (need >= 22)'}`);
  add('groundwork', 'ok', `v${VERSION}`);
  try {
    await initSqlBackend();
    const b = sqliteBackendAvailable();
    add('sqlite', 'ok', b === 'node:sqlite' ? 'node:sqlite' : 'sql.js (WASM fallback; node:sqlite unavailable)');
  } catch (e) {
    add('sqlite', 'fail', (e as Error).message);
  }
  try {
    await initParsers();
    for (const lang of Object.keys(SAMPLES) as Language[]) {
      const t = parse(lang, SAMPLES[lang]);
      const bad = t.rootNode.hasError;
      t.delete();
      add(`grammar:${lang}`, bad ? 'fail' : 'ok', bad ? 'sample did not parse cleanly' : 'loaded');
    }
  } catch (e) {
    add('grammars', 'fail', (e as Error).message);
  }
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    let inRepo = true;
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'ignore' });
    } catch {
      inRepo = false;
    }
    add('git', inRepo ? 'ok' : 'warn', inRepo ? `repo root ${root}` : 'not a git repo; falling back to a directory walk with .gitignore');
  } catch {
    add('git', 'warn', 'git not found; falling back to a directory walk');
  }
  try {
    mkdirSync(gwPath(root), { recursive: true });
    accessSync(gwPath(root), constants.W_OK);
    add('state dir', 'ok', gwPath(root));
  } catch (e) {
    add('state dir', 'fail', `${gwPath(root)} not writable: ${(e as Error).message}`);
  }
  let config: ReturnType<typeof loadConfig> | null = null;
  try {
    config = loadConfig(root);
    add('config', 'ok', existsSync(gwPath(root, 'config.json')) ? '.groundwork/config.json valid' : 'defaults (no config.json)');
  } catch (e) {
    add('config', 'fail', e instanceof ConfigError ? e.message : String(e));
  }
  let languages: Record<string, number> = {};
  if (existsSync(indexDbPath(root))) {
    try {
      const db = openDb(indexDbPath(root), { readonly: true });
      const v = readMeta(db, 'schema_version');
      let stats: ReturnType<typeof indexStats> | null = null;
      try {
        if (v === String(SCHEMA_VERSION)) stats = indexStats(db);
      } finally {
        db.close();
      }
      if (!stats) add('index', 'warn', `schema v${v}; will rebuild on next refresh`);
      else {
        languages = Object.fromEntries(Object.entries(stats.filesByLanguage).filter(([k]) => k !== 'null'));
        const problems = [stats.files === 0 ? 'no files indexed' : '', stats.filesPartial ? `${stats.filesPartial} partially parsed` : ''].filter(Boolean);
        const detail = `${stats.files} files, ${stats.symbols} symbols${stats.filesSkipped ? `, ${stats.filesSkipped} skipped` : ''}${stats.lastRefresh ? `, refreshed ${age(stats.lastRefresh)}` : ''}`;
        add('index', problems.length ? 'warn' : 'ok', problems.length ? `${detail}; ${problems.join(', ')}; run gw index` : detail);
      }
    } catch (e) {
      add('index', 'warn', `unreadable (${(e as Error).message}); run gw index`);
    }
  } else add('index', 'warn', 'not built yet; run gw init');
  const found = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  add('languages', found.length ? 'ok' : 'warn', found.length ? found.map(([l, n]) => `${l} ${n}`).join(', ') : 'none detected yet (build the index with gw init)');
  // Type backends: the TypeScript compiler for TS/TSX, pyright for Python; other languages get structural checks only.
  const has = (...langs: string[]) => langs.some((l) => (languages[l] ?? 0) > 0);
  const typesOn = config?.types.enabled !== false;
  if (has('typescript', 'tsx')) {
    let compiler: string | null = null;
    try {
      compiler = (createRequire(import.meta.url)('typescript') as { version: string }).version;
    } catch {
      compiler = null;
    }
    const off = !typesOn || config?.types.typescript === 'off';
    add('types:typescript', off || !compiler ? 'warn' : 'ok', off ? 'disabled in .groundwork/config.json (types); type errors will not be caught' : compiler ? `TypeScript ${compiler}${existsSync(path.join(root, 'tsconfig.json')) ? ', tsconfig.json found' : ', no tsconfig.json at the root (compiler defaults)'}` : 'TypeScript compiler could not be loaded; reinstall Groundwork');
  }
  if (has('python')) {
    const off = !typesOn || config?.types.python === 'off';
    const pyright = existsSync(path.join(root, 'node_modules', '.bin', 'pyright')) ? 'node_modules/.bin/pyright' : hasBin('pyright') ? 'pyright on PATH' : null;
    add('types:python', off || !pyright ? 'warn' : 'ok', off ? 'disabled in .groundwork/config.json (types); type errors will not be caught' : pyright ?? 'pyright not found; Python type checks are skipped (install with `npm i -g pyright` or `pip install pyright`)');
  }
  const untyped = found.map(([l]) => l).filter((l) => !['typescript', 'tsx', 'python', 'javascript'].includes(l));
  if (untyped.length) add('types:other', 'ok', `${untyped.join(', ')}: no type backend; calls, imports and duplicates are checked from the index`);
  if (config) add('profile', 'ok', `${config.profile}: ${config.profile === 'strict' ? 'the Stop gate blocks in clients with hooks' : 'findings are reported, the Stop gate does not block (gw install --profile strict to block)'}`);
  for (const c of clientStatuses(root, { home: options.home, hasBin })) checks.push(clientCheck(c));
  if (existsSync(gwPath(root, 'index.lock'))) add('lock', 'warn', 'index.lock present (another writer running, or stale; removed automatically when stale)');
  return checks;
}

export function register(program: Command): void {
  program
    .command('doctor')
    .description('check the runtime, grammars, languages, type backends, index and each client\'s hooks and MCP')
    .action(async (_o, cmd: Command) => {
      const opts = globalOpts(cmd);
      const checks = await runDoctor(repoRoot(opts));
      const ok = !checks.some((c) => c.status === 'fail');
      emit(opts, { ok, checks }, () => checks.map((c) => `${c.status === 'ok' ? 'ok  ' : c.status === 'warn' ? 'warn' : 'FAIL'}  ${c.name.padEnd(18)} ${c.detail}`).join('\n'));
      if (!ok) process.exitCode = 1;
    });
}

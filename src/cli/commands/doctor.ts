import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import type { Command } from 'commander';
import { ConfigError, loadConfig } from '../../config/load.js';
import { indexDbPath } from '../../index/store.js';
import { initParsers, parse } from '../../lang/parser.js';
import { initSqlBackend, openDb, sqliteBackendAvailable } from '../../store/db.js';
import { readMeta, SCHEMA_VERSION } from '../../store/schema.js';
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

export async function runDoctor(root: string): Promise<DoctorCheck[]> {
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
  try {
    loadConfig(root);
    add('config', 'ok', existsSync(gwPath(root, 'config.json')) ? '.groundwork/config.json valid' : 'defaults (no config.json)');
  } catch (e) {
    add('config', 'fail', e instanceof ConfigError ? e.message : String(e));
  }
  if (existsSync(indexDbPath(root))) {
    try {
      const db = openDb(indexDbPath(root), { readonly: true });
      const v = readMeta(db, 'schema_version');
      const files = Number(db.prepare('SELECT COUNT(*) n FROM files').get()?.n ?? 0);
      db.close();
      add('index', v === String(SCHEMA_VERSION) ? 'ok' : 'warn', v === String(SCHEMA_VERSION) ? `${files} files` : `schema v${v}; will rebuild on next refresh`);
    } catch (e) {
      add('index', 'warn', `unreadable (${(e as Error).message}); run gw index`);
    }
  } else add('index', 'warn', 'not built yet; run gw init');
  if (existsSync(gwPath(root, 'index.lock'))) add('lock', 'warn', 'index.lock present (another writer running, or stale; removed automatically when stale)');
  return checks;
}

export function register(program: Command): void {
  program
    .command('doctor')
    .description('check the runtime, grammars, storage and index')
    .action(async (_o, cmd: Command) => {
      const opts = globalOpts(cmd);
      const checks = await runDoctor(repoRoot(opts));
      const ok = !checks.some((c) => c.status === 'fail');
      emit(opts, { ok, checks }, () => checks.map((c) => `${c.status === 'ok' ? 'ok  ' : c.status === 'warn' ? 'warn' : 'FAIL'}  ${c.name.padEnd(18)} ${c.detail}`).join('\n'));
      if (!ok) process.exitCode = 1;
    });
}

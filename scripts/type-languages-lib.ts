import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const project = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const data = path.resolve(process.env.GW_TYPE_LANGUAGES_DATA ?? path.join(project, 'bench/type-languages'));
export const cache = path.resolve(process.env.GW_TYPE_LANGUAGES_CACHE ?? path.join(os.homedir(), 'work/gw-type-languages'));
export type Lang = 'go' | 'rust' | 'java' | 'csharp';
export const LANGUAGES: Lang[] = ['go', 'java', 'rust', 'csharp'];
export const EXTENSION: Record<Lang, string> = { go: '.go', rust: '.rs', java: '.java', csharp: '.cs' };
export interface Repository { id: string; language: Lang; url: string; commit: string; latency?: boolean }
export const registry = JSON.parse(readFileSync(path.join(data, 'repos.json'), 'utf8')) as { seed: number; repositories: Repository[] };
export const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
export const clonePath = (repo: Repository) => path.join(cache, repo.id);

export type Operator = 'invented-function' | 'invented-method' | 'wrong-arity' | 'wrong-import';
export const OPERATORS: Operator[] = ['invented-function', 'invented-method', 'wrong-arity', 'wrong-import'];
export interface Mutation { id: string; repo: string; language: Lang; operator: Operator; file: string; line: number; before: string; after: string }
export interface CleanCase { id: string; repo: string; language: Lang; commit: string; parent: string; files: string[]; eligibleFiles: number }
export interface Manifest {
  version: 1; seed: number; repositories: Repository[]; mutations: Mutation[]; clean: CleanCase[];
  sourceHashes: Record<string, Record<string, string>>;
  timing: Record<string, { file: string; line: number; sha256: string; languageLines: number }>;
}

const NON_PRODUCT = /(^|\/)(tests?|testing|testdata|test-data|test_data|examples?|benches|bench|benchmarks?|samples?|docs?|vendor|third_party|xtask|fuzz|build|eng)(\/|$)/i;
/** Product source files: the seeded errors go where an agent edits shipped code. */
export function productFile(language: Lang, file: string): boolean {
  if (!file.endsWith(EXTENSION[language]) || NON_PRODUCT.test(file)) return false;
  if (language === 'go') return !file.endsWith('_test.go');
  if (language === 'java') return file.includes('src/main/java/');
  if (language === 'csharp') return file.startsWith('src/') && !/(Tests?|Specs|Benchmarks?|TestUtils|Testing)(\.|\/)/.test(file);
  return !/(^|\/)tests?\.rs$/.test(file);
}

interface Definition { params: number; variadic: boolean }
const DEFINITION: Record<Lang, RegExp> = {
  go: /^func (?:\([^)]*\) )?([A-Za-z_]\w*)\(([^()]*)\)/,
  rust: /^\s*(?:pub(?:\([^)]*\))? )?(?:const |async |unsafe )*fn ([a-z_]\w*)\(([^()<>]*)\)/,
  java: /^\s*(?:(?:public|protected|private|static|final|synchronized)\s+)+[\w\[\].]+\s+([a-z]\w*)\(([^()<>]*)\)\s*(?:throws [\w, .]+)?\s*\{/,
  csharp: /^\s*(?:(?:public|internal|protected|private|static|override|virtual|async|sealed)\s+)+[\w\[\].?]+\s+([A-Z]\w*)\(([^()<>=]*)\)\s*(?:\{|=>|$)/,
};
const SKIP_LINE = /^\s*(\/\/|\/\*|\*|#|@|func |fn |pub |import |use |using |package |namespace )/;

/** The balanced argument text of the call whose opening parenthesis is at `open`, or null when it leaves the line. */
function argumentsAt(line: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    if ('([{'.includes(line[i]!)) depth++;
    else if (')]}'.includes(line[i]!)) { depth--; if (depth === 0) return line.slice(open + 1, i); }
    else if (line[i] === '"' || line[i] === "'" || line[i] === '`') return null;
  }
  return null;
}

/**
 * Syntax-only candidates: no compiler and no GroundWork check takes part.
 * Call operators only touch names the repository defines exactly once with a fixed parameter list.
 */
export function candidates(repo: Repository, root: string, files: string[]): Omit<Mutation, 'id'>[] {
  const language = repo.language;
  const texts = new Map(files.map((f) => [f, readFileSync(path.join(root, f), 'utf8').split('\n')]));
  const product = files.filter((f) => productFile(language, f));
  const definitions = new Map<string, Definition[]>();
  for (const lines of texts.values()) for (const line of lines) {
    const match = DEFINITION[language].exec(line);
    if (!match) { const loose = /\b(?:func|fn)\s+(?:\([^)]*\)\s*)?(\w+)|\s(\w+)\([^()]*\)\s*(?:throws [\w, .]+\s*)?\{/.exec(line); const name = loose?.[1] ?? loose?.[2]; if (name) definitions.set(name, [...(definitions.get(name) ?? []), { params: -1, variadic: true }]); continue; }
    const params = match[2]!.trim();
    const own = language === 'rust' ? params.replace(/^&?\s*(?:'\w+\s+)?(?:mut\s+)?self\s*,?/, '').trim() : params;
    definitions.set(match[1]!, [...(definitions.get(match[1]!) ?? []), { params: own ? own.split(',').filter((p) => p.trim()).length : 0, variadic: /\.\.\.|\bparams\b|=/.test(params) }]);
  }
  const unique = (name: string) => { const d = definitions.get(name); return d?.length === 1 && d[0]!.params >= 0 ? d[0]! : null; };
  const suffix = language === 'rust' ? '_gw' : 'Gw';
  const found: Omit<Mutation, 'id'>[] = [];
  const add = (operator: Operator, file: string, index: number, after: string) => found.push({ repo: repo.id, language, operator, file, line: index + 1, before: texts.get(file)![index]!, after });

  const namespaces = new Set<string>();
  if (language === 'csharp') for (const lines of texts.values()) for (const line of lines) { const m = /^\s*namespace\s+([\w.]+)/.exec(line); if (m) namespaces.add(m[1]!); }
  let goModule = '';
  if (language === 'go') { try { goModule = /^module\s+(\S+)/m.exec(readFileSync(path.join(root, 'go.mod'), 'utf8'))?.[1] ?? ''; } catch { /* no module */ } }
  const javaClasses = new Set(language === 'java' ? files.filter((f) => f.includes('src/main/java/')).map((f) => f.slice(f.indexOf('src/main/java/') + 14, -5).split('/').join('.')) : []);

  for (const file of product) {
    const lines = texts.get(file)!;
    if (lines.some((l) => /\bDO NOT EDIT\b|<auto-generated/.test(l))) continue;
    let raw = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Lines inside or touching a multi-line raw string (Go backticks, Rust r"..." and r#"..."#) are text, not code.
      const was = raw;
      if (language === 'go' && (line.split('`').length - 1) % 2) raw = !raw;
      if (language === 'rust') { if (!raw && /\br#*"[^"]*$/.test(line)) raw = true; else if (raw && /"#*/.test(line)) raw = false; }
      if (was || raw || line.length > 200) continue;
      if (language === 'go' && goModule) { const m = /^(\s*(?:[\w.]+\s+)?")([^"]+)("\s*)$/.exec(line); if (m && m[2]!.startsWith(`${goModule}/`)) add('wrong-import', file, i, `${m[1]}${m[2]}gw${m[3]}`); }
      if (language === 'rust') { const m = /^(\s*(?:pub(?:\([^)]*\))? )?use (?:crate|super)::(?:\w+::)*)(\w+)(;\s*)$/.exec(line); if (m && m[2] !== 'self') add('wrong-import', file, i, `${m[1]}${m[2]}_gw${m[3]}`); }
      if (language === 'java') { const m = /^(import )([\w.]+)(;\s*)$/.exec(line); if (m && javaClasses.has(m[2]!)) add('wrong-import', file, i, `${m[1]}${m[2]}Gw${m[3]}`); }
      if (language === 'csharp') { const m = /^(using )([\w.]+)(;\s*)$/.exec(line); if (m && namespaces.has(m[2]!)) add('wrong-import', file, i, `${m[1]}${m[2]}Gw${m[3]}`); }
      if (SKIP_LINE.test(line) || DEFINITION[language].test(line)) continue;
      for (const call of line.matchAll(/\b([A-Za-z_]\w{3,})\(/g)) {
        const name = call[1]!, at = call.index!;
        const definition = unique(name);
        if (!definition || /["'`]/.test(line.slice(0, at)) || /\b(new|fn|func|void|class|struct)\s+$/.test(line.slice(0, at))) continue;
        const renamed = `${line.slice(0, at)}${name}${suffix}${line.slice(at + name.length)}`;
        add(line[at - 1] === '.' ? 'invented-method' : 'invented-function', file, i, renamed);
        const args = argumentsAt(line, at + name.length);
        if (args !== null && !definition.variadic) {
          const open = at + name.length + 1;
          add('wrong-arity', file, i, `${line.slice(0, open + args.length)}${args.trim() ? ', ' : ''}0, 0${line.slice(open + args.length)}`);
        }
      }
    }
  }
  return found;
}

export const PER_OPERATOR = 5;
/** Ranked by a seeded hash; at most one mutation per file within an operator. */
export function select(seed: number, all: Omit<Mutation, 'id'>[]): Mutation[] {
  const rank = (c: Omit<Mutation, 'id'>) => sha(`${seed}:${JSON.stringify(c)}`);
  const picked: Mutation[] = [];
  for (const operator of OPERATORS) {
    const files = new Set<string>();
    for (const c of all.filter((x) => x.operator === operator).sort((a, b) => rank(a).localeCompare(rank(b)))) {
      if (files.has(c.file)) continue;
      files.add(c.file);
      picked.push({ id: `${c.repo}-${operator}-${files.size}`, ...c });
      if (files.size === PER_OPERATOR) break;
    }
  }
  return picked;
}

export const CLEAN_COMMITS = 50;
export const FILES_PER_COMMIT = 4;
export function cleanCases(seed: number, repo: Repository, root: string): CleanCase[] {
  const pattern = `*${EXTENSION[repo.language]}`;
  const cases: CleanCase[] = [];
  for (const row of git(root, 'log', '--no-merges', '--format=%H %P', repo.commit, '--', pattern).split('\n')) {
    const [commit, parent, extra] = row.split(' ');
    if (!commit || !parent || extra) continue;
    try { git(root, 'cat-file', '-e', `${parent}^{commit}`); } catch { continue; }
    const eligible = git(root, 'diff', '--no-renames', '--name-only', '--diff-filter=AM', parent, commit, '--', pattern).split('\n').filter(Boolean);
    if (!eligible.length) continue;
    const files = eligible.sort((a, b) => sha(`${seed}:${commit}:${a}`).localeCompare(sha(`${seed}:${commit}:${b}`))).slice(0, FILES_PER_COMMIT).sort();
    cases.push({ id: `${repo.id}-${commit.slice(0, 10)}`, repo: repo.id, language: repo.language, commit, parent, files, eligibleFiles: eligible.length });
    if (cases.length === CLEAN_COMMITS) break;
  }
  return cases;
}

export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]!;
}

export interface LanguageSummary {
  seeded: { total: number; A: number; B: number; recall: number; timedOut: number }; cleanCases: number; cleanChecked: number; falseBlocks: { A: number; B: number }; falseBlockRate: number;
  p50: number | null; p95: number | null; initMs: number[]; latencyRepo: string; latencyLines: number; complete: boolean;
  rules: { recall: boolean; falseBlocks: boolean; coverage: boolean; stopBudget: boolean; init: boolean; lines: boolean }; status: 'PASS' | 'FAIL' | 'INCOMPLETE';
}
export const GATE = { recall: 0.85, falseBlocksPer100: 1, cleanCoverage: 0.9, stopP95Ms: 4000, initMs: 60000, lines: 100000 };
export function decide(input: Omit<LanguageSummary, 'rules' | 'status' | 'falseBlockRate'> ): LanguageSummary {
  const falseBlockRate = input.cleanCases ? input.falseBlocks.B / input.cleanCases : 1;
  const rules = {
    recall: input.seeded.total >= 30 && input.seeded.recall >= GATE.recall,
    falseBlocks: input.cleanCases >= 100 && falseBlockRate * 100 <= GATE.falseBlocksPer100,
    coverage: input.cleanCases > 0 && input.cleanChecked / input.cleanCases >= GATE.cleanCoverage,
    stopBudget: input.p95 !== null && input.p95 <= GATE.stopP95Ms,
    init: input.initMs.length > 0 && Math.max(...input.initMs) < GATE.initMs,
    lines: input.latencyLines >= GATE.lines,
  };
  const status = !input.complete ? 'INCOMPLETE' : Object.values(rules).every(Boolean) ? 'PASS' : 'FAIL';
  return { ...input, falseBlockRate, rules, status };
}

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, realpathSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TypeFinding } from './index.js';
import { GO_CHECKER_SOURCE } from './go-checker.js';

export type CompiledLanguage = 'go' | 'rust' | 'java' | 'csharp';
/** Base text per changed file of one language; null means the file did not exist at the base commit. */
export type BaseTexts = Map<string, string | null>;
interface Raw { file: string; line: number; column: number; code: string; message: string; blocking: boolean }

const EXTENSIONS: Record<string, CompiledLanguage> = { '.go': 'go', '.rs': 'rust', '.java': 'java', '.cs': 'csharp' };
export const compiledLanguage = (file: string): CompiledLanguage | null => EXTENSIONS[path.extname(file)] ?? null;

const memo = new Map<string, Raw[]>();
/** Package-level compiler runs are shared by the files of one request only. */
export function resetCompilerMemo(): void { memo.clear(); goFailed.clear(); cargoMemo.clear(); rustTargets.clear(); batch = []; }
let batch: { file: string; ranges: [number, number][] | null }[] = [];
/** The changed files of one request, so a backend can check them all in one compiler run and knows which lines changed. */
export function setCompilerBatch(files: { file: string; ranges: [number, number][] | null }[]): void { batch = files; }

function run(binary: string, args: string[], cwd: string, deadline: number, env: Record<string, string> = {}): { status: number; output: string } {
  const remaining = deadline - Date.now();
  if (remaining < 250) throw new Error('timeout');
  const result = spawnSync(binary, args, { cwd, encoding: 'utf8', timeout: remaining - 100, killSignal: 'SIGKILL', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') throw new Error(`${path.basename(binary)} not found`);
  if (code === 'ETIMEDOUT' || result.signal === 'SIGKILL') throw new Error('timeout');
  if (result.error) throw result.error;
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

function nearest(root: string, file: string, matches: (names: string[]) => string | undefined): { directory: string; name: string } | null {
  const top = path.resolve(root);
  for (let directory = path.dirname(path.resolve(root, file)); ; directory = path.dirname(directory)) {
    let names: string[] = [];
    try { names = readdirSync(directory); } catch { /* a deleted directory has no project file */ }
    const name = matches(names);
    if (name) return { directory, name };
    if (directory === top || path.dirname(directory) === directory || path.relative(top, directory).startsWith('..')) return null;
  }
}
const unavailable = (output: string, fallback: string) => new Error((output.split('\n').map((l) => l.trim()).find((l) => /\berror\b|^go: |cannot|not found/i.test(l)) ?? fallback).slice(0, 200));

/** The per-repository scratch directory. Its path is predictable, so it is used only when it is a real directory that this user alone can write. */
function scratch(root: string): string {
  const directory = path.join(os.tmpdir(), `gw-types-${createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16)}`);
  try { mkdirSync(directory, { mode: 0o700 }); } catch { /* exists: verified below */ }
  const stat = lstatSync(directory);
  const uid = process.getuid?.();
  if (!stat.isDirectory() || (uid !== undefined && (stat.uid !== uid || (stat.mode & 0o022) !== 0))) throw new Error('unsafe scratch directory');
  return directory;
}

/**
 * A symlinked copy of the repository in which only the changed files carry their base text.
 * The path is stable per repository so compiler caches keyed by source path are reused, not multiplied.
 */
function baseTree(root: string, base: BaseTexts): string {
  const top = path.join(scratch(root), 'base-tree');
  rmSync(top, { recursive: true, force: true });
  const overrides = new Map([...base].map(([f, text]) => [path.resolve(root, f), text]));
  const parents = new Set<string>();
  for (const f of overrides.keys()) for (let d = path.dirname(f); d.startsWith(path.resolve(root)); d = path.dirname(d)) { parents.add(d); if (d === path.resolve(root)) break; }
  const mirror = (from: string, to: string) => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      const source = path.join(from, name), target = path.join(to, name);
      if (overrides.has(source)) { const text = overrides.get(source); if (typeof text === 'string') writeFileSync(target, text); }
      else if (parents.has(source)) mirror(source, target);
      else symlinkSync(source, target);
    }
  };
  mirror(path.resolve(root), top);
  // A file deleted since the base is not in the working tree to mirror.
  for (const [f, text] of overrides) {
    const target = path.join(top, path.relative(path.resolve(root), f));
    if (typeof text !== 'string' || existsSync(target)) continue;
    // Never write through a link that leaves the scratch tree.
    let ancestor = path.dirname(target);
    while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const inside = path.relative(realpathSync(top), realpathSync(ancestor));
    if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  return top;
}

// ---- Go: go/types from source, declarations only outside the checked packages; nothing is compiled ----
function goCode(message: string): [string, boolean] {
  if (/undefined \(.*has no field or method|^undefined: |\bundefined: [\w.]+$/.test(message) || / undefined \(/.test(message)) return [/has no field or method| undefined \(/.test(message) ? 'missing-member' : 'undefined', true];
  if (/^(not enough|too many) arguments in call/.test(message)) return ['arity', true];
  if (/^cannot use .* in argument to /.test(message)) return ['argument-type', true];
  if (/cannot call non-function/.test(message)) return ['non-callable', true];
  if (/is not in std\b|^no required module provides package|^cannot find (package|module providing package)/.test(message)) return ['unresolved-import', true];
  if (/declared and not used|imported and not used/.test(message)) return ['unused', false];
  return ['compile', false];
}
const goFailed = new Map<string, string>();
const goModule = (root: string, file: string) => nearest(root, file, (names) => names.includes('go.mod') ? 'go.mod' : undefined);
/** The checker binary for the Go toolchain this module selects, built on first use. Null when it cannot be built. */
function goChecker(root: string, module: string, deadline: number): string | null {
  const version = run('go', ['env', 'GOVERSION'], module, deadline).output.trim().split('\n')[0]!;
  const directory = path.join(scratch(root), `go-check-${createHash('sha256').update(`${version}\0${GO_CHECKER_SOURCE}`).digest('hex').slice(0, 16)}`);
  const binary = path.join(directory, process.platform === 'win32' ? 'gw-go-check.exe' : 'gw-go-check');
  if (existsSync(binary)) return binary;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'main.go'), GO_CHECKER_SOURCE);
  const temporary = `${binary}.${process.pid}`;
  const built = run('go', ['build', '-o', temporary, path.join(directory, 'main.go')], module, deadline, { GOPROXY: 'off', GOFLAGS: '', GOWORK: 'off' });
  if (built.status !== 0) { rmSync(temporary, { force: true }); return null; }
  renameSync(temporary, binary);
  return binary;
}
function goDiagnostics(root: string, file: string, deadline: number, base?: BaseTexts): Raw[] {
  const module = goModule(root, file);
  if (!module) throw new Error('no go.mod');
  const key = `go\0${module.directory}\0${base ? 'base' : ''}`;
  const cached = memo.get(key);
  if (cached) return cached;
  const failure = goFailed.get(key);
  if (failure) throw new Error(failure);
  let checker: string | null = null;
  try { checker = goChecker(root, module.directory, deadline); }
  catch (e) { if ((e as Error).message === 'timeout' || / not found$/.test((e as Error).message)) throw e; }
  if (!checker) return goBuildDiagnostics(root, file, deadline, base);
  // Every changed Go file of the module is checked in one run.
  // The Go tools name files by their real path, which a symlinked checkout does not share.
  const real = realpathSync(module.directory);
  const inReal = (absolute: string) => path.join(real, path.relative(module.directory, absolute));
  const targets = new Map<string, boolean>();
  for (const f of new Set([file, ...(base ? base.keys() : batch.map((c) => c.file))])) {
    if (!f.endsWith('.go') || goModule(root, f)?.directory !== module.directory) continue;
    const directory = path.dirname(path.resolve(root, f));
    if (existsSync(directory)) targets.set(inReal(directory), (targets.get(inReal(directory)) ?? false) || f.endsWith('_test.go'));
  }
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'gw-types-go-'));
  try {
    const request: { Dir: string; Targets: { Dir: string; Tests: boolean }[]; Overlay?: string; Exports: string } = {
      Dir: real, Targets: [...targets].map(([Dir, Tests]) => ({ Dir, Tests })),
      Exports: path.join(path.dirname(checker), `exports-${createHash('sha256').update(module.directory).digest('hex').slice(0, 16)}.json`),
    };
    if (base) {
      const replace: Record<string, string> = {};
      let n = 0;
      for (const [f, text] of base) {
        if (text === null) { replace[inReal(path.resolve(root, f))] = ''; continue; }
        const copy = path.join(temporary, `${n++}.go`); writeFileSync(copy, text); replace[inReal(path.resolve(root, f))] = copy;
      }
      request.Overlay = path.join(temporary, 'overlay.json');
      writeFileSync(request.Overlay, JSON.stringify({ Replace: replace }));
    }
    writeFileSync(path.join(temporary, 'request.json'), JSON.stringify(request));
    const { output } = run(checker, [path.join(temporary, 'request.json')], real, deadline, { GOPROXY: 'off' });
    let response: { diagnostics: { file: string; line: number; column: number; message: string }[]; unavailable?: string } | undefined;
    for (const line of output.split('\n')) { if (line.startsWith('{"diagnostics"')) { try { response = JSON.parse(line); } catch { /* not the response */ } } }
    // One failed run answers for every changed file of the module.
    const failed = !response ? unavailable(output, 'go check failed') : response.unavailable ? new Error(response.unavailable.slice(0, 200)) : null;
    if (failed) { goFailed.set(key, failed.message); throw failed; }
    const found = response!.diagnostics.map((d) => {
      const [code, blocking] = goCode(d.message);
      return { file: path.join(module.directory, path.relative(real, d.file)), line: d.line, column: d.column, code, message: d.message, blocking };
    });
    memo.set(key, found);
    return found;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
/** The compiler through `go build` (`go vet` for test files), for a machine where the checker cannot be built. */
function goBuildDiagnostics(root: string, file: string, deadline: number, base?: BaseTexts): Raw[] {
  const module = nearest(root, file, (names) => names.includes('go.mod') ? 'go.mod' : undefined);
  if (!module) throw new Error('no go.mod');
  const test = file.endsWith('_test.go');
  const packageDirectory = path.dirname(path.resolve(root, file));
  const key = `go-build\0${packageDirectory}\0${test}\0${base ? 'base' : ''}`;
  const cached = memo.get(key);
  if (cached) return cached;
  const target = `./${path.relative(module.directory, packageDirectory).split(path.sep).join('/')}`;
  let temporary: string | undefined;
  try {
    const overlay: string[] = [];
    // The compiler reports an overlaid file under its replacement path.
    const copies = new Map<string, string>();
    if (base) {
      temporary = mkdtempSync(path.join(os.tmpdir(), 'gw-types-go-'));
      const replace: Record<string, string> = {};
      let n = 0;
      for (const [f, text] of base) {
        if (text === null) { replace[path.resolve(root, f)] = ''; continue; }
        const copy = path.join(temporary, `${n++}.go`); writeFileSync(copy, text); replace[path.resolve(root, f)] = copy; copies.set(copy, path.resolve(root, f));
      }
      writeFileSync(path.join(temporary, 'overlay.json'), JSON.stringify({ Replace: replace }));
      overlay.push('-overlay', path.join(temporary, 'overlay.json'));
    }
    const args = test ? ['vet', ...overlay, target] : ['build', ...overlay, '-gcflags=-e', '-o', os.devNull, target];
    const { status, output } = run('go', args, module.directory, deadline, { GOPROXY: 'off' });
    const found: Raw[] = [];
    for (const line of output.split('\n')) {
      const match = /^(?:vet: )?(.+?\.go):(\d+):(\d+): (.*)$/.exec(line.trim());
      if (!match) continue;
      const [code, blocking] = goCode(match[4]!);
      const reported = path.resolve(module.directory, match[1]!);
      found.push({ file: copies.get(reported) ?? reported, line: Number(match[2]), column: Number(match[3]), code, message: match[4]!, blocking });
    }
    if (status !== 0 && !found.length) throw unavailable(output, 'go build failed');
    memo.set(key, found);
    return found;
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
}

// ---- Rust: `cargo check --offline`, base text through a symlinked tree ----
const RUST_BLOCKING = new Set(['E0425', 'E0599', 'E0061', 'E0432', 'E0433', 'E0609', 'E0618', 'E0560', 'E0423', 'E0412']);
/**
 * Line ranges that only a test build compiles. Braces are not matched (string literals hold them too):
 * an attributed item with a body runs to the end of the file, which is where test modules sit.
 */
export function rustTestRegions(text: string): [number, number][] {
  const lines = text.split('\n');
  const regions: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    const attribute = /^\s*#(!?)\[(?:cfg|cfg_attr)\(.*\btest\b|^\s*#\[(?:\w+::)*test\b/.exec(lines[i]!);
    if (!attribute) continue;
    if (attribute[1]) return [[1, lines.length]];
    for (let j = i; j < lines.length; j++) {
      const code = lines[j]!.replace(/^\s*#\[.*\]\s*/, '');
      const body = code.indexOf('{'), end = code.indexOf(';');
      if (end >= 0 && (body < 0 || end < body)) { regions.push([i + 1, j + 1]); i = j; break; }
      if (body >= 0 || j === lines.length - 1) return [...regions, [i + 1, lines.length]];
    }
  }
  return regions;
}
interface CargoRun { found: Raw[]; /** Source files of the package's units that were checked without `cfg(test)`. */ plain: Set<string> }
const cargoMemo = new Map<string, CargoRun>();
/** Whether the current-text check of a file needed the test targets, so its base-text check runs the same way. */
const rustTargets = new Map<string, boolean>();
function cargoCheck(root: string, tree: string, crate: string, allTargets: boolean, deadline: number): CargoRun {
  const key = `${tree}\0${crate}\0${allTargets}`;
  const cached = cargoMemo.get(key);
  if (cached) return cached;
  const { status, output } = run('cargo', ['check', '--offline', '--quiet', '--message-format=json', ...(allTargets ? ['--all-targets'] : [])], crate, deadline);
  const result: CargoRun = { found: [], plain: new Set() };
  const seen = new Set<string>();
  let messages = 0;
  // rustc reports paths relative to the workspace root, or to the package for a lone crate.
  const bases = [crate];
  for (let d = path.dirname(crate); !path.relative(tree, d).startsWith('..'); d = path.dirname(d)) { bases.push(d); if (d === tree) break; }
  for (const line of output.split('\n')) {
    if (!line.startsWith('{')) continue;
    let entry: {
      reason?: string; manifest_path?: string; filenames?: string[]; profile?: { test?: boolean };
      message?: { level?: string; message?: string; code?: { code?: string } | null; spans?: { is_primary?: boolean; file_name: string; line_start: number; column_start: number; label?: string | null }[] };
    };
    try { entry = JSON.parse(line); } catch { continue; }
    const package_ = entry.manifest_path ? path.dirname(entry.manifest_path) : undefined;
    if (entry.reason === 'compiler-artifact' && package_ === crate && entry.profile?.test === false) {
      // The dependency file beside each artifact lists the sources that unit compiled.
      for (const artifact of entry.filenames ?? []) {
        const name = path.basename(artifact).replace(/\.[^.]+$/, '');
        for (const candidate of [name, name.replace(/^lib/, '')]) {
          let text: string;
          try { text = readFileSync(path.join(path.dirname(artifact), `${candidate}.d`), 'utf8'); } catch { continue; }
          for (const rule of text.split('\n')) {
            const colon = rule.indexOf(': ');
            if (colon < 0) continue;
            for (const source of rule.slice(colon + 2).split(/(?<!\\) /)) {
              const name_ = source.replace(/\\ /g, ' ');
              for (const b of bases) result.plain.add(path.resolve(b, name_));
            }
          }
        }
      }
    }
    if (entry.reason !== 'compiler-message' || entry.message?.level !== 'error') continue;
    messages++;
    const span = entry.message.spans?.find((s) => s.is_primary);
    if (!span) continue;
    const resolved = [...bases, ...(package_ ? [package_] : [])].map((b) => path.resolve(b, span.file_name)).find((f) => existsSync(f));
    if (!resolved) continue;
    const code = entry.message.code?.code ?? 'error';
    const argument = code === 'E0308' && (entry.message.spans ?? []).some((s) => /arguments? to this .* (is|are) incorrect/.test(s.label ?? ''));
    const id = `${resolved}:${span.line_start}:${span.column_start}:${code}:${entry.message.message}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.found.push({ file: path.resolve(root, path.relative(tree, resolved)), line: span.line_start, column: span.column_start, code, message: entry.message.message ?? code, blocking: RUST_BLOCKING.has(code) || argument });
  }
  if (status !== 0 && !messages) throw unavailable(output, 'cargo check failed');
  cargoMemo.set(key, result);
  return result;
}
function rustDiagnostics(root: string, file: string, deadline: number, base?: BaseTexts): Raw[] {
  if (!nearest(root, file, (names) => names.includes('Cargo.toml') ? 'Cargo.toml' : undefined)) throw new Error('no Cargo.toml');
  const tree = base ? baseTree(root, base) : path.resolve(root);
  try {
    const crate = nearest(tree, file, (names) => names.includes('Cargo.toml') ? 'Cargo.toml' : undefined);
    if (!crate) return [];
    const absolute = path.resolve(root, file);
    const all = () => cargoCheck(root, tree, crate.directory, true, deadline).found;
    if (base) {
      const targets = rustTargets.get(absolute);
      if (targets !== undefined) return targets ? all() : cargoCheck(root, tree, crate.directory, false, deadline).found;
    }
    if (/(^|[\\/])(tests|benches|examples)[\\/]/.test(file)) { rustTargets.set(absolute, true); return all(); }
    // The library and binaries alone are the quicker check, and enough unless the edit is in code only a test build compiles.
    const plain = cargoCheck(root, tree, crate.directory, false, deadline);
    let text = '';
    try { text = readFileSync(path.join(tree, file), 'utf8'); } catch { /* deleted */ }
    const regions = rustTestRegions(text);
    const ranges = base ? null : batch.find((c) => c.file === file)?.ranges ?? null;
    const inTests = ranges === null ? regions.length > 0 : ranges.some(([a, b]) => regions.some(([from, to]) => a <= to && b >= from));
    const mine = plain.found.filter((f) => f.file === absolute);
    // An error in the file shows as well as the dependency file does that the plain build compiles it.
    const settled = mine.some((f) => f.blocking) || ((plain.plain.has(path.join(tree, file)) || mine.length > 0) && !inTests);
    if (!base) rustTargets.set(absolute, !settled);
    return settled ? plain.found : all();
  } finally { if (base) rmSync(tree, { recursive: true, force: true }); }
}

// ---- Java: javac on the changed file against the project's source roots and whatever classes are installed ----
const JAVA_BLOCKING: [RegExp, string][] = [
  [/^cannot find symbol/, 'cant.resolve'], [/^package .* does not exist/, 'doesnt.exist'],
  [/cannot be applied to given types|^no suitable (method|constructor) found/, 'cant.apply'],
];
function javaClasspath(project: string): string[] {
  const entries: string[] = [];
  for (const d of ['target/classes', 'target/test-classes', 'build/classes/java/main', 'build/classes/java/test', 'bin']) if (existsSync(path.join(project, d))) entries.push(path.join(project, d));
  for (const d of ['lib', 'libs', 'target/dependency']) {
    try { for (const jar of readdirSync(path.join(project, d))) if (jar.endsWith('.jar')) entries.push(path.join(project, d, jar)); } catch { /* optional */ }
  }
  const wanted: [string, string, string | undefined][] = [];
  try {
    for (const block of readFileSync(path.join(project, 'pom.xml'), 'utf8').match(/<dependency>[\s\S]*?<\/dependency>/g) ?? []) {
      const field = (name: string) => new RegExp(`<${name}>\\s*([^<$\\s]+)\\s*</${name}>`).exec(block)?.[1];
      const group = field('groupId'), artifact = field('artifactId');
      if (group && artifact) wanted.push([group, artifact, field('version')]);
    }
  } catch { /* not Maven */ }
  for (const build of ['build.gradle', 'build.gradle.kts']) {
    try { for (const m of readFileSync(path.join(project, build), 'utf8').matchAll(/['"]([\w.-]+):([\w.-]+):([\w.-]+)['"]/g)) wanted.push([m[1]!, m[2]!, m[3]]); } catch { /* not Gradle */ }
  }
  const versions = (directory: string) => { try { return readdirSync(directory).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); } catch { return []; } };
  for (const [group, artifact, version] of wanted) {
    const maven = path.join(os.homedir(), '.m2', 'repository', ...group.split('.'), artifact);
    const gradle = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', group, artifact);
    const v = version ?? versions(maven)[0] ?? versions(gradle)[0];
    if (!v) continue;
    const jar = path.join(maven, v, `${artifact}-${v}.jar`);
    if (existsSync(jar)) { entries.push(jar); continue; }
    for (const hash of versions(path.join(gradle, v))) { const g = path.join(gradle, v, hash, `${artifact}-${v}.jar`); if (existsSync(g)) { entries.push(g); break; } }
  }
  return entries;
}
const javaPackage = (text: string) => /^\s*package\s+([\w.]+)\s*;/m.exec(text)?.[1] ?? '';
function javaRoot(absolute: string, text: string): string {
  const parts = javaPackage(text).split('.').filter(Boolean);
  let directory = path.dirname(absolute);
  for (const part of parts.reverse()) { if (path.basename(directory) !== part) return path.dirname(absolute); directory = path.dirname(directory); }
  return directory;
}
/** Whether a build file from the project up to the repository root matches: the module list, or a code generator. */
function javaBuild(root: string, project: string, files: string[], pattern: RegExp): boolean {
  const top = path.resolve(root);
  for (let directory = project; ; directory = path.dirname(directory)) {
    for (const file of files) {
      try { if (pattern.test(readFileSync(path.join(directory, file), 'utf8'))) return true; } catch { /* absent */ }
    }
    if (directory === top || path.dirname(directory) === directory || path.relative(top, directory).startsWith('..')) return false;
  }
}
const javaMultiModule = (root: string, project: string) => javaBuild(root, project, ['pom.xml'], /<modules>/) || javaBuild(root, project, ['settings.gradle', 'settings.gradle.kts'], /\binclude\b/);
// javac runs here without annotation processors, so names they generate (Lombok accessors and builders, mappers, factories) look undefined.
const javaGenerates = (root: string, project: string) => javaBuild(root, project, ['pom.xml', 'build.gradle', 'build.gradle.kts'], /lombok|annotationProcessor|<annotationProcessorPaths>|\bkapt\b|mapstruct|auto-value|immutables|dagger/i);
function javaDiagnostics(root: string, file: string, deadline: number, base?: BaseTexts): Raw[] {
  const absolute = path.resolve(root, file);
  const current = readFileSync(absolute, 'utf8');
  const sourceRoot = javaRoot(absolute, current);
  const project = nearest(root, file, (names) => names.find((n) => n === 'pom.xml' || n === 'build.gradle' || n === 'build.gradle.kts'))?.directory ?? path.resolve(root);
  const roots = new Set([sourceRoot]);
  for (const d of ['src/main/java', 'src/test/java', 'src']) if (existsSync(path.join(project, d))) roots.add(path.join(project, d));
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'gw-types-java-'));
  try {
    let target = absolute, text = current;
    const sourcepath = [...roots];
    if (base) {
      const baseRoot = path.join(temporary, 'base');
      for (const [f, t] of base) {
        if (t === null) continue;
        const copy = path.join(baseRoot, ...javaPackage(t).split('.').filter(Boolean), path.basename(f));
        const checked = path.resolve(root, f) === absolute;
        // Two modules can hold the same package and file name: the checked file's base text wins.
        if (!checked && existsSync(copy)) continue;
        mkdirSync(path.dirname(copy), { recursive: true }); writeFileSync(copy, t);
        if (checked) { target = copy; text = t; }
      }
      if (target === absolute) return [];
      sourcepath.unshift(baseRoot);
    }
    const classpath = javaClasspath(project);
    const out = path.join(temporary, 'out'); mkdirSync(out);
    const { status, output } = run('javac', ['-J-Duser.language=en', '-proc:none', '-implicit:none', '-nowarn', '-Xmaxerrs', '500', '-encoding', 'UTF-8', '-d', out, '-sourcepath', sourcepath.join(path.delimiter), ...(classpath.length ? ['-cp', classpath.join(path.delimiter)] : []), target], path.resolve(root), deadline);
    const found: Raw[] = [];
    let errors = 0, open: Raw | undefined, mine = false;
    for (const line of output.split('\n')) {
      const match = /^(.+?\.java):(\d+): error: (.*)$/.exec(line);
      if (match) {
        errors++; open = undefined;
        mine = path.resolve(root, match[1]!) === target;
        if (!mine) continue;
        const kind = JAVA_BLOCKING.find(([pattern]) => pattern.test(match[3]!));
        open = { file: absolute, line: Number(match[2]), column: 1, code: kind?.[1] ?? 'error', message: match[3]!, blocking: kind !== undefined };
        found.push(open);
      } else if (open) {
        const caret = /^(\s*)\^\s*$/.exec(line);
        const detail = /^\s+(symbol|location):\s+(.*)$/.exec(line);
        if (caret) open.column = caret[1]!.length + 1;
        else if (detail) open.message += detail[1] === 'symbol' ? `: ${detail[2]}` : ` in ${detail[2]}`;
      }
    }
    if (status !== 0 && !errors) throw unavailable(output, 'javac failed');
    // An import of a library that is not on the classpath makes every later error in the file unreliable.
    // An import of a library that is not on the classpath makes every later error in the file unreliable.
    // In a multi-module build a sibling module shares the package prefix, so there only a package in this module's sources is known.
    const own = javaPackage(text).split('.').slice(0, 2).join('.');
    const modules = javaMultiModule(root, project);
    const lines = text.split('\n');
    const incomplete = javaGenerates(root, project) || found.some((f) => {
      const match = /^\s*import\s+(static\s+)?([\w.]+)/.exec(lines[f.line - 1] ?? '');
      if (!match) return false;
      const imported = match[2]!;
      if (!(own && (imported === own || imported.startsWith(`${own}.`)))) return true;
      if (!modules) return false;
      const names = imported.split('.').filter(Boolean);
      const parts = names.slice(0, names.length - (match[1] ? 2 : 1) + (imported.endsWith('.') ? 1 : 0));
      // The import names a package, or a type nested in a class of one.
      return !sourcepath.some((r) => existsSync(path.join(r, ...parts)) || parts.some((name, i) => i > 0 && existsSync(path.join(r, ...parts.slice(0, i), `${name}.java`))));
    });
    if (incomplete) for (const f of found) { f.blocking = false; if (!f.message.endsWith('(classpath incomplete)')) f.message += ' (classpath incomplete)'; }
    return found;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

// ---- C#: `dotnet build --no-restore` into a scratch output directory, base text through a symlinked tree ----
const CSHARP_BLOCKING = new Set(['CS0103', 'CS0117', 'CS1061', 'CS1501', 'CS7036', 'CS0246', 'CS0234', 'CS1503', 'CS0149', 'CS1955']);
function dotnetBinary(): string {
  const home = process.env.DOTNET_ROOT ? path.join(process.env.DOTNET_ROOT, 'dotnet') : path.join(os.homedir(), '.dotnet', 'dotnet');
  return (process.env.PATH ?? '').split(path.delimiter).some((d) => d && existsSync(path.join(d, 'dotnet'))) || !existsSync(home) ? 'dotnet' : home;
}
function csharpDiagnostics(root: string, file: string, deadline: number, base?: BaseTexts): Raw[] {
  const pick = (names: string[]) => names.filter((n) => n.endsWith('.csproj')).sort()[0];
  const owner = nearest(root, file, pick);
  if (!owner) throw new Error('no .csproj');
  // Which of several projects in one directory compiles the file is not knowable without evaluating them.
  if (readdirSync(owner.directory).filter((n) => n.endsWith('.csproj')).length > 1) throw new Error('several .csproj in one directory');
  const tree = base ? baseTree(root, base) : path.resolve(root);
  try {
    const project = nearest(tree, file, pick);
    if (!project) return [];
    const key = `csharp\0${path.join(project.directory, project.name)}`;
    const cached = memo.get(key);
    if (cached) return cached;
    // Outputs go to a scratch directory, so a check never replaces the project's own bin and obj.
    const output_ = path.join(scratch(root), base ? 'base-out' : 'out');
    mkdirSync(output_, { recursive: true });
    const targets = path.join(output_, 'groundwork.targets');
    writeFileSync(targets, '<Project><PropertyGroup><IntermediateOutputPath>$(GroundWorkOutput)/obj/$(MSBuildProjectName)/$(TargetFramework)/</IntermediateOutputPath><OutDir>$(GroundWorkOutput)/bin/$(MSBuildProjectName)/$(TargetFramework)/</OutDir></PropertyGroup></Project>\n');
    // One target framework is enough to find errors: the newest .NET one the project lists.
    const frameworks = [...readFileSync(path.join(project.directory, project.name), 'utf8').matchAll(/<TargetFrameworks[^>]*>([^<]*)</g)].flatMap((m) => m[1]!.split(';')).map((f) => f.trim()).filter((f) => /^net\d+\.\d+$/.test(f));
    // Only a framework the last restore covered can build with --no-restore.
    let restored: Set<string> | null = null;
    const real = nearest(root, file, pick)!;
    const candidates = [path.join(real.directory, 'obj', 'project.assets.json')];
    // The SDK's artifacts layout keeps obj under <solution>/artifacts/obj/<project>.
    for (let directory = real.directory; ; directory = path.dirname(directory)) {
      candidates.push(path.join(directory, 'artifacts', 'obj', real.name.replace(/\.csproj$/, ''), 'project.assets.json'));
      if (directory === path.resolve(root) || path.dirname(directory) === directory) break;
    }
    for (const candidate of candidates) {
      try {
        const assets = JSON.parse(readFileSync(candidate, 'utf8')) as { project?: { frameworks?: Record<string, unknown> } };
        restored = new Set(Object.keys(assets.project?.frameworks ?? {}));
        break;
      } catch { /* not restored here */ }
    }
    const framework = frameworks.filter((f) => !restored?.size || restored.has(f)).sort((a, b) => Number(b.slice(3)) - Number(a.slice(3)))[0];
    const { status, output } = run(dotnetBinary(), ['build', project.name, '--no-restore', '-nologo', '-v:q', '-clp:NoSummary', ...(framework ? ['-f', framework] : []), '-p:GenerateFullPaths=true', '-p:RunAnalyzers=false', '-p:TreatWarningsAsErrors=false', `-p:CustomBeforeMicrosoftCommonTargets=${targets}`, `-p:GroundWorkOutput=${output_}`], project.directory, deadline, { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' });
    const found: Raw[] = [];
    const seen = new Set<string>();
    for (const line of output.split('\n')) {
      const match = /^(.+?\.cs)\((\d+),(\d+)(?:,\d+,\d+)?\): error (CS\d+): (.*?)(?: \[[^\]]*\])?$/.exec(line.trim());
      if (!match || seen.has(match[0]!.replace(/ \[[^\]]*\]$/, ''))) continue;
      seen.add(match[0]!.replace(/ \[[^\]]*\]$/, ''));
      const absolute = path.resolve(project.directory, match[1]!);
      found.push({ file: path.resolve(root, path.relative(tree, absolute)), line: Number(match[2]), column: Number(match[3]), code: match[4]!, message: match[5]!, blocking: CSHARP_BLOCKING.has(match[4]!) });
    }
    if (status !== 0 && !found.length) throw unavailable(output, 'dotnet build failed');
    memo.set(key, found);
    return found;
  } finally { if (base) rmSync(tree, { recursive: true, force: true }); }
}

const BACKENDS: Record<CompiledLanguage, (root: string, file: string, deadline: number, base?: BaseTexts) => Raw[]> = { go: goDiagnostics, rust: rustDiagnostics, java: javaDiagnostics, csharp: csharpDiagnostics };

const MANIFESTS = /^(go\.(mod|sum)|Cargo\.(toml|lock)|pom\.xml|build\.gradle(\.kts)?|.*\.csproj|Directory\.(Build|Packages)\.props)$/;
/**
 * Base diagnostics depend only on the commit, the base texts and the project files, so they are kept on disk:
 * without this every Stop that finds an error would compile the project twice.
 */
function baseCacheFile(language: CompiledLanguage, root: string, file: string, base: BaseTexts): string | null {
  const variant = language === 'rust' ? String(rustTargets.get(path.resolve(root, file))) : '';
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 2000 });
  if (head.status !== 0) return null;
  const hash = createHash('sha256').update([language, file, head.stdout.trim(), variant].join('\0'));
  for (const [name, text] of [...base].sort(([a], [b]) => a.localeCompare(b))) hash.update(`\0${name}\0${text === null ? '\0' : text}`);
  const top = path.resolve(root);
  for (let directory = path.dirname(path.resolve(root, file)); ; directory = path.dirname(directory)) {
    let names: string[] = [];
    try { names = readdirSync(directory).filter((n) => MANIFESTS.test(n)).sort(); } catch { /* deleted directory */ }
    for (const name of names) { try { hash.update(`\0${name}\0`).update(readFileSync(path.join(directory, name))); } catch { /* unreadable */ } }
    if (directory === top || path.dirname(directory) === directory || path.relative(top, directory).startsWith('..')) break;
  }
  return path.join(scratch(root), 'base-cache', `${hash.digest('hex').slice(0, 32)}.json`);
}
function baseDiagnostics(language: CompiledLanguage, root: string, file: string, deadline: number, base: BaseTexts): Raw[] {
  const cache = baseCacheFile(language, root, file, base);
  if (cache) { try { return JSON.parse(readFileSync(cache, 'utf8')) as Raw[]; } catch { /* not cached */ } }
  const found = BACKENDS[language](root, file, deadline, base);
  if (cache) { try { mkdirSync(path.dirname(cache), { recursive: true }); writeFileSync(cache, JSON.stringify(found)); } catch { /* cache is optional */ } }
  return found;
}

/** Compiler errors for one file. With `base`, the changed files are compiled at their base text instead. */
export function compilerDiagnostics(language: CompiledLanguage, root: string, file: string, deadline: number, base?: BaseTexts): TypeFinding[] {
  const absolute = path.resolve(root, file);
  // An emptied file is a deletion in progress: every compiler rejects it, and none of that is about the edit.
  try { if (!base && !readFileSync(absolute, 'utf8').trim()) return []; } catch { return []; }
  return (base ? baseDiagnostics(language, root, file, deadline, base) : BACKENDS[language](root, file, deadline)).filter((f) => f.file === absolute).map((f) => {
    const name = /['"`‘]([^'"`’]+)['"`’]/.exec(f.message)?.[1] ?? /(?:undefined: |cannot find symbol: \w+ )([\w.]+)/.exec(f.message)?.[1] ?? '';
    return { file, line: f.line, column: f.column, name, message: f.message, code: f.code, language, blocking: f.blocking };
  });
}

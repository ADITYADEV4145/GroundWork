import { existsSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goAdapter } from '../lang/go.js';
import { initParsersFor } from '../lang/parser.js';
import type { Arity, ExportInfo, ModuleSurface, PackageRef } from './surface.js';

// Go surface: exported identifiers of a package directory, read from the module cache, `vendor/`, the local
// toolchain's standard library, or a sibling module in the workspace. `go` itself is never run.

export interface GoModuleRoot {
  /** Directory holding go.mod. */
  dir: string;
  module: string;
  requires: Map<string, string>;
  /** `replace` targets: module path -> local directory or `path@version`. */
  replaces: Map<string, string>;
}

export interface GoPackage {
  ref: PackageRef;
  importPath: string;
  dir: string;
  /** Sibling module or this module's own package: read live, never cached. */
  local: boolean;
}

function read(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function parseGoMod(dir: string): GoModuleRoot | null {
  const text = read(path.join(dir, 'go.mod'));
  if (text === null) return null;
  const root: GoModuleRoot = { dir, module: '', requires: new Map(), replaces: new Map() };
  let block: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (block) {
      if (line === ')') block = null;
      else entry(root, block, line);
      continue;
    }
    const open = /^(require|replace|exclude|retract)\s*\($/.exec(line);
    if (open) {
      block = open[1]!;
      continue;
    }
    const mod = /^module\s+(\S+)/.exec(line);
    if (mod) root.module = mod[1]!.replace(/^"|"$/g, '');
    const single = /^(require|replace)\s+(.+)$/.exec(line);
    if (single) entry(root, single[1]!, single[2]!);
  }
  return root.module ? root : null;
}

function entry(root: GoModuleRoot, kind: string, line: string): void {
  if (kind === 'require') {
    const [mod, version] = line.split(/\s+/);
    if (mod && version) root.requires.set(mod, version);
  } else if (kind === 'replace') {
    const m = /^(\S+)(?:\s+\S+)?\s*=>\s*(\S+)(?:\s+(\S+))?$/.exec(line);
    if (m) root.replaces.set(m[1]!, m[3] ? `${m[2]}@${m[3]}` : m[2]!);
  }
}

/** Module-cache directories escape upper-case letters as `!x`. */
function escapePath(p: string): string {
  return p.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);
}

export function goModCache(): string[] {
  const out: string[] = [];
  if (process.env.GOMODCACHE) out.push(process.env.GOMODCACHE);
  for (const gopath of (process.env.GOPATH ?? path.join(os.homedir(), 'go')).split(path.delimiter)) if (gopath) out.push(path.join(gopath, 'pkg', 'mod'));
  return [...new Set(out)].filter((d) => existsSync(d));
}

let goRootCache: { dir: string; version: string } | null | undefined;
export function goRoot(): { dir: string; version: string } | null {
  if (goRootCache !== undefined) return goRootCache;
  const candidates = [process.env.GOROOT, '/usr/local/go', '/usr/lib/go', '/usr/lib/golang', '/opt/homebrew/opt/go/libexec', '/usr/local/opt/go/libexec'];
  for (const dir of candidates) {
    if (!dir || !existsSync(path.join(dir, 'src', 'fmt'))) continue;
    const version = (read(path.join(dir, 'VERSION')) ?? '').split('\n')[0]!.replace(/^go/, '').trim();
    if (version) return (goRootCache = { dir, version });
  }
  return (goRootCache = null);
}

/** The go.mod that governs a file: nearest ancestor inside the repo. */
export function goModFor(root: string, relFile: string): GoModuleRoot | null {
  let dir = path.dirname(path.resolve(root, relFile));
  for (;;) {
    const mod = parseGoMod(dir);
    if (mod) return mod;
    if (dir === root || path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}

export function locateGoPackage(root: string, mod: GoModuleRoot, importPath: string, siblings: Map<string, string>): GoPackage | null {
  if (importPath === 'C' || importPath === 'unsafe') return null;
  const under = (m: string): string | null => (importPath === m ? '' : importPath.startsWith(`${m}/`) ? importPath.slice(m.length + 1) : null);
  // Local code: this module, a `replace` to a directory, or a go.work sibling.
  const locals: [string, string][] = [[mod.module, mod.dir], ...siblings];
  for (const [m, target] of mod.replaces) if (target.startsWith('.') || path.isAbsolute(target)) locals.push([m, path.resolve(mod.dir, target)]);
  for (const [m, dir] of locals.sort((a, b) => b[0].length - a[0].length)) {
    const rest = under(m);
    if (rest === null) continue;
    const pkgDir = path.join(dir, rest);
    if (!existsSync(pkgDir)) return null;
    return { ref: { ecosystem: 'go', name: m, version: 'workspace', location: dir }, importPath, dir: pkgDir, local: true };
  }
  if (!importPath.split('/')[0]!.includes('.')) {
    const std = goRoot();
    const dir = std ? path.join(std.dir, 'src', importPath) : null;
    return std && dir && existsSync(dir) ? { ref: { ecosystem: 'go', name: 'std', version: std.version, location: std.dir }, importPath, dir, local: false } : null;
  }
  const vendored = path.join(mod.dir, 'vendor', importPath);
  let best: [string, string] | null = null;
  for (const [m, version] of mod.requires) if (under(m) !== null && (!best || m.length > best[0].length)) best = [m, version];
  if (!best) return null;
  let [modulePath, version] = best;
  const rest = under(modulePath)!;
  const replaced = mod.replaces.get(modulePath);
  if (replaced && replaced.includes('@')) [modulePath, version] = replaced.split('@') as [string, string];
  else if (replaced) return null;
  if (existsSync(path.join(mod.dir, 'vendor', 'modules.txt')) && existsSync(vendored)) {
    return { ref: { ecosystem: 'go', name: best[0], version, location: path.join(mod.dir, 'vendor') }, importPath, dir: vendored, local: false };
  }
  for (const cache of goModCache()) {
    const moduleDir = path.join(cache, `${escapePath(modulePath)}@${escapePath(version)}`);
    if (!existsSync(moduleDir)) continue;
    const dir = path.join(moduleDir, rest);
    // The module is installed and has no such directory: the import itself is invented. Reported by the caller.
    return { ref: { ecosystem: 'go', name: best[0], version, location: moduleDir }, importPath, dir, local: false };
  }
  return null;
}

export async function buildGoSurface(pkg: GoPackage): Promise<ModuleSurface> {
  let names: string[];
  try {
    names = readdirSync(pkg.dir).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
  } catch {
    return { exports: {}, open: true, why: 'package directory could not be read' };
  }
  if (!names.length) return { exports: {}, open: true, why: 'directory has no Go files' };
  await initParsersFor(['go']);
  const exports: Record<string, ExportInfo> = {};
  const arities = new Map<string, Arity[]>();
  let open = false;
  let why: string | undefined;
  let packageName: string | null = null;
  const mentions = new Set<string>();
  for (const name of names) {
    const text = read(path.join(pkg.dir, name));
    if (text === null) {
      open = true;
      why ??= 'a source file could not be read';
      continue;
    }
    // cgo and generated-at-build code declare names this cannot see.
    if (/^import\s+"C"$/m.test(text) || /^\s*"C"$/m.test(text)) {
      open = true;
      why ??= 'package uses cgo';
    }
    // Files for every platform are read together: a name that exists on any platform counts as existing.
    const declared = /^package\s+(\w+)/m.exec(text)?.[1];
    if (!declared || declared === 'main' || declared.endsWith('_test')) continue;
    if (/^\/\/\s*\+build ignore|^\/\/go:build ignore/m.test(text)) continue;
    packageName ??= declared;
    // Backstop for declaration forms the extractor may not list (grouped const/var blocks, embedded aliases).
    for (const m of text.matchAll(/\b[A-Z]\w*/g)) mentions.add(m[0]);
    let extracted;
    try {
      extracted = goAdapter.extract(text, 'go');
    } catch {
      open = true;
      why ??= 'a source file could not be parsed';
      continue;
    }
    for (const s of extracted.symbols) {
      if (s.parent !== null || !/^[A-Z]/.test(s.name)) continue;
      // A method is extracted with its receiver as parent or as a qualified name; only package-level names here.
      if (s.kind === 'method' || s.qualifiedName.includes('.')) continue;
      const kind = s.kind === 'function' ? 'function' : ['class', 'interface', 'type', 'enum'].includes(s.kind) ? 'type' : 'value';
      exports[s.name] ??= { kind, signature: s.signature.replace(/\s+/g, ' ').slice(0, 160) };
      if (s.kind === 'function') arities.set(s.name, [...(arities.get(s.name) ?? []), [s.minArity, s.maxArity]]);
      const deprecated = /(?:^|\n)\s*Deprecated:\s*([^\n]*)/.exec(s.docstring ?? '');
      if (deprecated) exports[s.name]!.deprecated = deprecated[1]!.trim().slice(0, 160);
    }
  }
  for (const [name, list] of arities) if (exports[name]?.kind === 'function') exports[name]!.arities = list;
  if (!Object.keys(exports).length && !open) {
    open = true;
    why ??= 'package exports nothing readable';
  }
  for (const name of Object.keys(exports)) mentions.delete(name);
  return { exports, open, ...(why ? { why } : {}), ...(packageName ? { name: packageName } : {}), ...(open ? {} : { mentions: [...mentions] }) };
}

/** Sibling modules named by `go.work`: module path -> directory. */
export function goWorkModules(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const text = read(path.join(root, 'go.work'));
  if (text === null) return out;
  const uses: string[] = [];
  let inUse = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (inUse) {
      if (line === ')') inUse = false;
      else if (line) uses.push(line);
    } else if (/^use\s*\($/.test(line)) inUse = true;
    else {
      const m = /^use\s+(\S+)/.exec(line);
      if (m) uses.push(m[1]!);
    }
  }
  for (const use of uses) {
    const dir = path.resolve(root, use.replace(/^"|"$/g, ''));
    const mod = parseGoMod(dir);
    if (mod) out.set(mod.module, dir);
  }
  return out;
}

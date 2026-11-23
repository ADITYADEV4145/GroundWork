import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pythonAdapter } from '../lang/python.js';
import { initParsersFor } from '../lang/parser.js';
import type { ExportInfo, ModuleSurface, PackageRef } from './surface.js';

// PyPI surface: what an installed module defines, read from its source or stubs in site-packages. Python modules
// can grow names at runtime, so a name is only "missing" when the module's source never mentions it and the
// module shows no sign of dynamic attributes.

export interface PyModule {
  ref: PackageRef;
  module: string;
  /** Source and stub files that define the module (stub first). */
  files: string[];
  /** Directory of a package (`__init__`), whose entries are importable submodules. */
  packageDir: string | null;
  /** Compiled extension with no stub: nothing can be listed. */
  binaryOnly: boolean;
}

function dirs(p: string): string[] {
  try {
    return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  } catch {
    return [];
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** site-packages directories of the project's own environments. The interpreter is never started. */
export function sitePackages(root: string, extra: string[] = []): string[] {
  const out: string[] = [];
  const add = (p: string): void => {
    if (existsSync(p) && !out.includes(p)) out.push(p);
  };
  for (const e of extra) add(path.resolve(root, e));
  const envs = ['.venv', 'venv', 'env', '.env'].map((d) => path.join(root, d));
  if (process.env.VIRTUAL_ENV) envs.push(process.env.VIRTUAL_ENV);
  for (const env of envs) {
    for (const py of dirs(path.join(env, 'lib')).filter((d) => d.startsWith('python'))) add(path.join(env, 'lib', py, 'site-packages'));
    add(path.join(env, 'Lib', 'site-packages'));
  }
  return out;
}

const versions = new Map<string, Map<string, string>>();

export function resetPyVersions(): void {
  versions.clear();
}

/** Top-level import name -> installed version, from `*.dist-info` (never by running pip). */
function installedVersions(site: string): Map<string, string> {
  const cached = versions.get(site);
  if (cached) return cached;
  const map = new Map<string, string>();
  for (const d of dirs(site)) {
    const m = /^(.+?)-(\d[^-]*)\.(dist-info|egg-info)$/.exec(d);
    if (!m) continue;
    const names = new Set<string>([m[1]!.toLowerCase().replace(/[-.]+/g, '_')]);
    try {
      for (const line of readFileSync(path.join(site, d, 'top_level.txt'), 'utf8').split('\n')) if (line.trim()) names.add(line.trim());
    } catch {
      try {
        for (const line of readFileSync(path.join(site, d, 'RECORD'), 'utf8').split('\n').slice(0, 5000)) {
          const top = line.split(',')[0]!.split('/')[0]!;
          if (top && !top.includes('.') && !top.startsWith('_') && top !== '..') names.add(top);
          else if (/^[A-Za-z_]\w*\.py$/.test(top)) names.add(top.slice(0, -3));
        }
      } catch {
        // normalised distribution name only
      }
    }
    for (const n of names) if (!map.has(n)) map.set(n, m[2]!);
  }
  versions.set(site, map);
  return map;
}

export function locatePyModule(sites: string[], module: string): PyModule | null {
  if (!module || module.startsWith('.')) return null;
  const parts = module.split('.');
  for (const site of sites) {
    const top = parts[0]!;
    const bases = [path.join(site, ...parts), path.join(site, `${top}-stubs`, ...parts.slice(1))];
    const files: string[] = [];
    let packageDir: string | null = null;
    let binaryOnly = false;
    for (const base of bases) {
      for (const f of [`${base}.pyi`, path.join(base, '__init__.pyi'), `${base}.py`, path.join(base, '__init__.py')]) {
        if (!isFile(f)) continue;
        files.push(f);
        if (path.basename(f).startsWith('__init__.')) packageDir ??= path.dirname(f);
      }
    }
    if (!files.length) {
      const dir = path.dirname(bases[0]!);
      const leaf = parts.at(-1)!;
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        entries = [];
      }
      if (entries.some((e) => e.startsWith(`${leaf}.`) && /\.(so|pyd|dylib)$/.test(e))) binaryOnly = true;
      else if (existsSync(bases[0]!) && parts.length >= 1 && dirs(path.dirname(bases[0]!)).includes(leaf)) {
        // Namespace package: a directory with no __init__; its names are its submodules only, and other
        // distributions may add to it, so it is treated as open.
        binaryOnly = true;
      } else continue;
    }
    const version = installedVersions(site).get(top);
    if (!version) return null;
    return { ref: { ecosystem: 'pypi', name: top, version, location: site }, module, files, packageDir, binaryOnly };
  }
  return null;
}

const DYNAMIC = /\b(__getattr__|globals\(\)|locals\(\)|vars\(\)|setattr\(|sys\.modules\[|__dict__|lazy_loader|LazyLoader|_LazyModule|lazy_import|importlib\.import_module|__import__\(|exec\()/;
const MAX_MENTIONS = 60000;

function identifiers(text: string, into: Set<string>): void {
  for (const m of text.matchAll(/[A-Za-z_]\w*/g)) into.add(m[0]);
}

export async function buildPySurface(mod: PyModule, sites: string[]): Promise<ModuleSurface> {
  if (mod.binaryOnly) return { exports: {}, open: true, why: 'compiled or namespace module with no stub' };
  await initParsersFor(['python']);
  const exports: Record<string, ExportInfo> = {};
  const mentions = new Set<string>();
  let open = false;
  let why: string | undefined;
  const seen = new Set<string>();

  const read = (files: string[], packageDir: string | null, moduleName: string, depth: number): void => {
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        open = true;
        why ??= 'module source could not be read';
        continue;
      }
      if (DYNAMIC.test(text)) {
        open = true;
        why ??= 'module defines attributes dynamically';
      }
      identifiers(text, mentions);
      let extracted;
      try {
        extracted = pythonAdapter.extract(text, 'python');
      } catch {
        open = true;
        why ??= 'module source could not be parsed';
        continue;
      }
      const counts = new Map<string, number>();
      for (const s of extracted.symbols) if (s.parent === null) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
      for (const s of extracted.symbols) {
        if (s.parent !== null || s.name.startsWith('_')) continue;
        const info: ExportInfo = { kind: s.kind === 'class' ? 'class' : s.kind === 'function' ? 'function' : 'value', signature: s.signature.replace(/\s+/g, ' ').slice(0, 160) };
        // Arity only for a plain function defined once: decorators and redefinitions change the call shape.
        if (s.kind === 'function' && counts.get(s.name) === 1 && s.decorators.length === 0 && depth === 0 && !exports[s.name]) {
          const required = s.params.filter((p) => !p.rest && !p.kwrest && p.default === undefined && !p.optional).length;
          const open_ = s.params.some((p) => p.rest || p.kwrest);
          info.arities = [[required, open_ ? null : s.params.length]];
        }
        if (exports[s.name]) delete exports[s.name]!.arities;
        else exports[s.name] = info;
      }
      for (const imp of extracted.imports) {
        if (imp.kind === 'reexport-all') {
          const target = imp.module.startsWith('.') ? resolveRelative(moduleName, packageDir !== null, imp.module) : imp.module;
          const found = target && depth < 6 ? locatePyModule(sites, target) : null;
          if (!found || found.binaryOnly) {
            open = true;
            why ??= `star-imports '${imp.module}', which cannot be read`;
          } else read(found.files, found.packageDir, found.module, depth + 1);
          continue;
        }
        const local = imp.alias ?? (imp.kind === 'module' ? imp.module.split('.')[0]! : imp.name);
        if (local && local !== '*' && !local.startsWith('_') && !exports[local]) exports[local] = { kind: 'value' };
      }
    }
    if (packageDir) {
      try {
        for (const e of readdirSync(packageDir, { withFileTypes: true })) {
          const name = e.isDirectory() ? e.name : /^([A-Za-z_]\w*)\.(py|pyi)$/.exec(e.name)?.[1] ?? /^([A-Za-z_]\w*)\..*\.(so|pyd)$/.exec(e.name)?.[1];
          if (!name || name.startsWith('_') || !/^[A-Za-z_]\w*$/.test(name)) continue;
          mentions.add(name);
          if (depth === 0) exports[name] ??= { kind: 'namespace', members: null };
        }
      } catch {
        // listing is best-effort
      }
    }
  };
  read(mod.files, mod.packageDir, mod.module, 0);
  if (mentions.size > MAX_MENTIONS) {
    open = true;
    why ??= 'module is too large to list';
  }
  for (const name of Object.keys(exports)) mentions.delete(name);
  return { exports, open, ...(why ? { why } : {}), ...(open ? {} : { mentions: [...mentions] }) };
}

function resolveRelative(moduleName: string, isPackage: boolean, relative: string): string | null {
  const dots = /^\.+/.exec(relative)![0].length;
  const base = moduleName.split('.');
  if (!isPackage) base.pop();
  for (let i = 1; i < dots; i++) if (!base.pop()) return null;
  const rest = relative.slice(dots);
  return [...base, ...(rest ? [rest] : [])].join('.') || null;
}

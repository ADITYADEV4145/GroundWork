import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import type { Arity, ExportInfo, ModuleSurface, PackageRef } from './surface.js';

// npm surface: the exports TypeScript sees for an installed package, read from its type definitions
// (`types`/`exports` in package.json, a sibling `@types/*` package, or TypeScript sources for a workspace package).
// A package with no types is "open": nothing can be proven about it, so nothing is reported.

type Ts = typeof import('typescript');

export interface NpmModule {
  ref: PackageRef;
  /** Subpath inside the package (`''` for the root import). */
  subpath: string;
  /** Declaration or source file that defines the module, or null when the package ships no types. */
  entry: string | null;
  /** Ambient module name to look up instead of a file (`declare module "fs"` in @types/node). */
  ambient?: string;
  /** Cache entry name when it differs from the subpath (the `require` declarations of a dual package). */
  cacheKey?: string;
  /** Workspace source: read live, never cached. */
  workspace?: boolean;
  /** Types come from a separate `@types/*` package, which may describe a different version than the one installed. */
  separateTypes?: boolean;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function splitSpecifier(specifier: string): { name: string; subpath: string } | null {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#') || /^[a-z]+:/i.test(specifier)) return null;
  const parts = specifier.split('/');
  const n = specifier.startsWith('@') ? 2 : 1;
  if (parts.length < n || parts.slice(0, n).some((p) => !p)) return null;
  return { name: parts.slice(0, n).join('/'), subpath: parts.slice(n).join('/') };
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

const TYPE_EXTS = ['.d.ts', '.d.mts', '.d.cts'];
const SOURCE_EXTS = ['.ts', '.tsx', '.mts', '.cts'];

/** A declaration (or, for workspaces, source) file for a path that may name a .js file, a stem or a directory. */
function typeFileFor(target: string, allowSource: boolean): string | null {
  const exts = allowSource ? [...TYPE_EXTS, ...SOURCE_EXTS] : TYPE_EXTS;
  if (isFile(target) && (TYPE_EXTS.some((e) => target.endsWith(e)) || (allowSource && SOURCE_EXTS.some((e) => target.endsWith(e))))) return target;
  const stem = target.replace(/\.(d\.)?[cm]?[jt]sx?$/, '');
  for (const e of exts) if (isFile(stem + e)) return stem + e;
  for (const e of exts) if (isFile(path.join(target, `index${e}`))) return path.join(target, `index${e}`);
  for (const e of exts) if (isFile(path.join(stem, `index${e}`))) return path.join(stem, `index${e}`);
  return null;
}

/** First string reachable through an `exports` condition object, preferring type conditions. */
function conditionTarget(node: unknown, cjs: boolean, depth = 0): string[] {
  if (typeof node === 'string') return [node];
  if (!node || typeof node !== 'object' || depth > 6) return [];
  if (Array.isArray(node)) return node.flatMap((n) => conditionTarget(n, cjs, depth + 1));
  const obj = node as Record<string, unknown>;
  // A `require()` consumer gets the require branch, whose declarations may differ from the import branch.
  const order = cjs ? ['types', 'typings', 'require', 'node', 'default', 'import'] : ['types', 'typings', 'import', 'require', 'node', 'default'];
  const keys = [...order.filter((k) => k in obj), ...Object.keys(obj).filter((k) => !order.includes(k) && !k.startsWith('.'))];
  return keys.flatMap((k) => conditionTarget(obj[k], cjs, depth + 1));
}

function exportsTargets(exportsField: unknown, subpath: string, cjs: boolean): string[] | null {
  if (exportsField === undefined || exportsField === null) return null;
  const key = subpath ? `./${subpath}` : '.';
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) return key === '.' ? conditionTarget(exportsField, cjs) : [];
  const obj = exportsField as Record<string, unknown>;
  const subpaths = Object.keys(obj).filter((k) => k.startsWith('.'));
  if (!subpaths.length) return key === '.' ? conditionTarget(obj, cjs) : [];
  if (key in obj) return conditionTarget(obj[key], cjs);
  for (const pattern of subpaths.filter((k) => k.includes('*')).sort((a, b) => b.length - a.length)) {
    const [pre, post] = pattern.split('*') as [string, string];
    if (key.startsWith(pre) && key.endsWith(post) && key.length >= pre.length + post.length) {
      const star = key.slice(pre.length, key.length - post.length);
      return conditionTarget(obj[pattern], cjs).map((t) => t.replaceAll('*', star));
    }
  }
  return [];
}

function entryIn(dir: string, pkg: Record<string, unknown>, subpath: string, allowSource: boolean, cjs = false): string | null {
  const candidates: string[] = [];
  const mapped = exportsTargets(pkg.exports, subpath, cjs);
  if (mapped) candidates.push(...mapped);
  if (!subpath) {
    for (const field of ['types', 'typings', 'module', 'main']) if (typeof pkg[field] === 'string') candidates.push(pkg[field] as string);
    candidates.push('index');
  } else if (!mapped) candidates.push(subpath);
  for (const c of candidates) {
    const found = typeFileFor(path.join(dir, c), allowSource);
    if (found) return found;
    if (allowSource) {
      // A workspace package points at build output that may not exist yet: read the source it is built from.
      const src = c.replace(/^(\.\/)?(dist|build|lib|out)\//, 'src/');
      const fromSrc = src !== c ? typeFileFor(path.join(dir, src), true) : null;
      if (fromSrc) return fromSrc;
    }
  }
  if (allowSource && !subpath) return typeFileFor(path.join(dir, 'src', 'index'), true);
  return null;
}

function findPackageDir(fromDir: string, name: string, stopAt: string): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir || dir === stopAt) return null;
    dir = parent;
  }
}

/** Locate the installed (or workspace) package an import names. Null: not installed here, so nothing to check. */
export function locateNpmModule(root: string, fromFile: string, specifier: string, workspaces: Map<string, string>, cjs = false): NpmModule | null {
  const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
  if (isBuiltin(specifier)) {
    const types = findPackageDir(path.dirname(path.resolve(root, fromFile)), '@types/node', root);
    const version = types ? String(readJson(path.join(types, 'package.json'))?.version ?? '') : '';
    if (!types || !version) return null;
    const entry = typeFileFor(path.join(types, 'index'), false);
    return entry ? { ref: { ecosystem: 'npm', name: '@types/node', version, location: types }, subpath: bare, entry, ambient: bare, separateTypes: true } : null;
  }
  const split = splitSpecifier(specifier);
  if (!split) return null;
  // What the consumer has installed wins: a workspace name only stands in when node_modules has no copy, or
  // links to the workspace itself.
  const installed = findPackageDir(path.dirname(path.resolve(root, fromFile)), split.name, root);
  const dir = installed ?? workspaces.get(split.name);
  if (!dir) return null;
  const pkg = readJson(path.join(dir, 'package.json'));
  if (!pkg) return null;
  let real = dir;
  try {
    real = realpathSync(dir);
  } catch {
    // keep the unresolved path
  }
  const isWorkspace = !real.split(path.sep).includes('node_modules');
  const ref: PackageRef = { ecosystem: 'npm', name: split.name, version: String(pkg.version ?? '0.0.0'), location: real };
  // The declarations can come from the package or, failing that, from @types; either may pick by condition.
  const typesName = `@types/${split.name.startsWith('@') ? split.name.slice(1).replace('/', '__') : split.name}`;
  const typesDir = isWorkspace ? null : findPackageDir(path.dirname(path.resolve(root, fromFile)), typesName, root);
  const typesPkg = typesDir ? readJson(path.join(typesDir, 'package.json')) : null;
  const resolve = (forCjs: boolean): { entry: string | null; separate: boolean } => {
    const own = entryIn(real, pkg, split.subpath, isWorkspace, forCjs);
    if (own || !typesDir || !typesPkg) return { entry: own, separate: false };
    const typed = entryIn(typesDir, typesPkg, split.subpath, false, forCjs);
    return { entry: typed, separate: typed !== null };
  };
  const { entry, separate: separateTypes } = resolve(cjs);
  const condition = cjs && entry !== resolve(false).entry;
  // The cached surface is only valid for this pairing of package and types versions.
  if (separateTypes) ref.location = `${real} + ${typesName}@${String(typesPkg!.version ?? '')}`;
  return { ref, subpath: split.subpath, entry, ...(isWorkspace ? { workspace: true } : {}), ...(separateTypes ? { separateTypes: true } : {}), ...(condition ? { cacheKey: `${split.subpath}#require` } : {}) };
}

let tsModule: Ts | null = null;
async function loadTs(): Promise<Ts> {
  tsModule ??= (await import('typescript')).default;
  return tsModule;
}

const MAX_MEMBERS = 4000;

function signatureArity(ts: Ts, sig: import('typescript').Signature): Arity | null {
  const decl = sig.getDeclaration() as import('typescript').SignatureDeclaration | undefined;
  if (!decl?.parameters) return null;
  let min = 0;
  let max: number | null = 0;
  let optionalSeen = false;
  for (const p of decl.parameters) {
    if (ts.isIdentifier(p.name) && p.name.text === 'this') continue;
    if (p.dotDotDotToken) {
      max = null;
      continue;
    }
    if (max !== null) max++;
    // A parameter whose type includes undefined/void may be omitted by callers in practice; without a full
    // lib we cannot tell, so only `?` and defaults count as optional and anything unresolvable stays required.
    const optional = !!p.questionToken || !!p.initializer || (!!p.type && /\b(void|undefined)\b/.test(p.type.getText()));
    if (optional) optionalSeen = true;
    else if (!optionalSeen) min++;
    else min = (max ?? min);
  }
  return [min, max];
}

/** False when a base class or interface does not resolve, so inherited members would be missing from a listing. */
function basesResolve(ts: Ts, checker: import('typescript').TypeChecker, type: import('typescript').Type, seen = new Set<import('typescript').Type>()): boolean {
  if (type.flags & ts.TypeFlags.Any) return false;
  if (seen.has(type) || seen.size > 200) return true;
  seen.add(type);
  for (const d of type.getSymbol()?.declarations ?? []) {
    for (const clause of (d as import('typescript').ClassLikeDeclaration).heritageClauses ?? []) {
      for (const t of clause.types) {
        const base = checker.getTypeAtLocation(t);
        if (base.flags & ts.TypeFlags.Any || !basesResolve(ts, checker, base, seen)) return false;
        const expr = checker.getTypeAtLocation(t.expression);
        if (expr.flags & ts.TypeFlags.Any) return false;
      }
    }
  }
  return true;
}

function describe(ts: Ts, checker: import('typescript').TypeChecker, symbol: import('typescript').Symbol, at: import('typescript').Node, depth: number): ExportInfo {
  let sym = symbol;
  if (sym.flags & ts.SymbolFlags.Alias) {
    try {
      sym = checker.getAliasedSymbol(sym);
    } catch {
      return { kind: 'value' };
    }
  }
  const flags = sym.flags;
  const decls = sym.declarations ?? [];
  const info: ExportInfo = {
    kind: flags & ts.SymbolFlags.Class ? 'class' : flags & ts.SymbolFlags.Function ? 'function'
      : flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Property | ts.SymbolFlags.Enum | ts.SymbolFlags.Method | ts.SymbolFlags.Accessor) ? 'value'
      : flags & ts.SymbolFlags.Module ? 'namespace' : 'type',
  };
  if (!decls.length) return { kind: 'value' };
  const deprecated = decls.map((d) => ts.getJSDocDeprecatedTag(d));
  if (deprecated.every(Boolean)) {
    const comment = deprecated[0]!.comment;
    info.deprecated = (typeof comment === 'string' ? comment : (comment ?? []).map((c) => c.text).join('')).replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  let type: import('typescript').Type | null = null;
  try {
    type = info.kind === 'type' ? null : checker.getTypeOfSymbolAtLocation(sym, at);
  } catch {
    type = null;
  }
  if (type && !(type.flags & ts.TypeFlags.Any)) {
    const sigs = info.kind === 'class' ? type.getConstructSignatures() : type.getCallSignatures();
    // A union or intersection of callables, or a type that is both callable and constructable, has call shapes
    // this cannot enumerate with certainty.
    const plain = !(type.flags & (ts.TypeFlags.Union | ts.TypeFlags.Intersection));
    if (sigs.length && plain) {
      const arities = sigs.map((s) => signatureArity(ts, s));
      if (arities.every((a): a is Arity => a !== null)) {
        info.arities = arities;
        if (info.kind === 'value') info.kind = 'function';
        try {
          info.signature = checker.signatureToString(sigs[0]!).replace(/\s+/g, ' ').slice(0, 160);
        } catch {
          // signature text is cosmetic
        }
      }
    }
    if (depth > 0) {
      const members: Record<string, ExportInfo> = {};
      let listable = plain;
      let count = 0;
      const add = (m: import('typescript').Symbol): void => {
        if (count++ > MAX_MEMBERS) listable = false;
        else if (!m.name.startsWith('__')) members[m.name] ??= describe(ts, checker, m, at, depth - 1);
      };
      for (const m of type.getProperties()) add(m);
      if (flags & ts.SymbolFlags.Module) for (const m of checker.getExportsOfModule(sym)) add(m);
      // An index signature or an unresolved base means names exist that are not listed.
      if (type.getStringIndexType() || type.getNumberIndexType()) listable = false;
      if (listable && !basesResolve(ts, checker, type)) listable = false;
      info.members = listable && (Object.keys(members).length > 0 || info.kind === 'namespace') ? members : null;
    }
  } else if (type) info.members = null;
  if (info.members === undefined && flags & ts.SymbolFlags.Module && depth > 0) {
    info.members = Object.fromEntries(checker.getExportsOfModule(sym).map((m) => [m.name, describe(ts, checker, m, at, depth - 1)]));
  }
  return info;
}

/** Build the surface of one module from its declaration file. Synchronous TypeScript work; callers cache it. */
export async function buildNpmSurface(mod: NpmModule): Promise<ModuleSurface> {
  return (await buildNpmSurfaces([mod]))[0]!;
}

/** Build many modules with one TypeScript program, so the standard library and shared types are read once. */
export async function buildNpmSurfaces(mods: NpmModule[]): Promise<ModuleSurface[]> {
  const typed = mods.filter((m) => m.entry);
  if (!typed.length) return mods.map(() => ({ exports: {}, open: true, why: 'package ships no type definitions' }));
  const ts = await loadTs();
  const options: import('typescript').CompilerOptions = {
    types: [], skipLibCheck: true, noEmit: true, allowJs: false, esModuleInterop: true, lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const program = ts.createProgram({ rootNames: [...new Set(typed.map((m) => m.entry!))], options });
  const checker = program.getTypeChecker();
  return mods.map((mod) => {
    try {
      return surfaceOf(ts, program, checker, mod);
    } catch (error) {
      return { exports: {}, open: true, why: `type definitions could not be analysed (${(error as Error).message.slice(0, 80)})` };
    }
  });
}

function surfaceOf(ts: Ts, program: import('typescript').Program, checker: import('typescript').TypeChecker, mod: NpmModule): ModuleSurface {
  if (!mod.entry) return { exports: {}, open: true, why: 'package ships no type definitions' };
  const sf = program.getSourceFile(mod.entry);
  if (!sf) return { exports: {}, open: true, why: 'type definitions could not be read' };
  let moduleSymbol: import('typescript').Symbol | undefined;
  if (mod.ambient) moduleSymbol = checker.getAmbientModules().find((m) => m.name === `"${mod.ambient}"` || m.name === `"node:${mod.ambient}"`);
  else moduleSymbol = checker.getSymbolAtLocation(sf) ?? checker.getAmbientModules().find((m) => m.name === `"${mod.subpath ? `${mod.ref.name}/${mod.subpath}` : mod.ref.name}"`);
  if (!moduleSymbol) return { exports: {}, open: true, why: 'type definitions declare no module' };

  let open = false;
  let why: string | undefined;
  // `export * from` a module that does not resolve hides names from this listing.
  const seen = new Set<string>();
  const scan = (file: import('typescript').SourceFile): void => {
    if (seen.has(file.fileName) || seen.size > 400) return;
    seen.add(file.fileName);
    const visit = (node: import('typescript').Node): void => {
      if (ts.isExportDeclaration(node) && !node.exportClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = checker.getSymbolAtLocation(node.moduleSpecifier);
        const decl = target?.declarations?.[0];
        if (!target || !decl) {
          open = true;
          why = `re-exports everything from '${node.moduleSpecifier.text}', which is not installed`;
        } else scan(decl.getSourceFile());
      } else if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) node.body.statements.forEach(visit);
    };
    file.statements.forEach(visit);
  };
  for (const d of moduleSymbol.declarations ?? [sf]) scan(d.getSourceFile());

  const exports: Record<string, ExportInfo> = {};
  const exportEquals = moduleSymbol.exports?.get('export=' as import('typescript').__String);
  for (const sym of checker.getExportsOfModule(moduleSymbol)) {
    if (sym.name === 'export=') continue;
    exports[sym.name] = describe(ts, checker, sym, sf, 1);
  }
  if (exportEquals) {
    // CommonJS `export = x`: `import x from` and `import * as x` both see x; named imports see its members.
    const whole = describe(ts, checker, exportEquals, sf, 1);
    if (whole.members === null) {
      open = true;
      why ??= 'exports a value whose members cannot be listed';
    } else for (const [name, member] of Object.entries(whole.members ?? {})) exports[name] ??= member;
    exports.default ??= whole;
    if (whole.arities) exports['export='] = { kind: whole.kind, arities: whole.arities, ...(whole.signature ? { signature: whole.signature } : {}) };
  }
  if (!Object.keys(exports).length && !exportEquals) {
    open = true;
    why ??= 'type definitions export nothing';
  }
  // Declarations taken from other packages: the cached surface is only valid while those stay at this version.
  const files = new Set(seen);
  for (const sym of checker.getExportsOfModule(moduleSymbol)) {
    const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    for (const d of target.declarations ?? []) files.add(d.getSourceFile().fileName);
  }
  const via: Record<string, string> = {};
  const dirs = new Map<string, string | null>();
  for (const file of files) {
    const manifest = nearestManifest(path.dirname(file), dirs);
    if (!manifest || path.dirname(manifest) === mod.ref.location || path.dirname(manifest) === path.dirname(nearestManifest(path.dirname(mod.entry), dirs) ?? '')) continue;
    via[manifest] = String(readJson(manifest)?.version ?? '');
  }
  return { exports, open, ...(why ? { why } : {}), ...(Object.keys(via).length ? { via } : {}) };
}

function nearestManifest(dir: string, memo: Map<string, string | null>): string | null {
  const hit = memo.get(dir);
  if (hit !== undefined) return hit;
  const here = path.join(dir, 'package.json');
  const parent = path.dirname(dir);
  const found = typeof readJson(here)?.version === 'string' ? here : parent === dir ? null : nearestManifest(parent, memo);
  memo.set(dir, found);
  return found;
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import type { Finding } from '../grounding/verify.js';
import { nameSimilarity, type Suggestion } from '../grounding/suggest.js';
import { callFacts, fileFacts, importFacts, type CallFact, type FileFacts, type ImportFact } from '../index/query.js';
import type { Db } from '../store/db.js';
import { buildCrateSurface, cargoLock, locateCrate } from './cargo.js';
import { buildGoSurface, goModFor, locateGoPackage, type GoModuleRoot } from './go.js';
import { findJavaClass, javaClassSurface, javaProject, resetJavaProjects } from './maven.js';
import { buildNpmSurfaces, locateNpmModule, splitSpecifier, type NpmModule } from './npm.js';
import { buildPySurface, locatePyModule, resetPyVersions, sitePackages } from './python.js';
import { arityAllows, arityText, readCachedSurface, shortVersion, writeCachedSurface, type ExportInfo, type ModuleSurface, type PackageRef } from './surface.js';
import { discoverWorkspaces, type Workspaces } from './workspaces.js';

// Checking beyond the repo: imports and calls into installed dependencies and sibling workspace packages.
// A finding blocks only when the installed version's surface is closed (fully listed) and the name is absent;
// everything uncertain is skipped or downgraded to a warning.

export interface DepStats {
  /** Imports and calls that were compared against a dependency surface. */
  checks: number;
  /** Surfaces built in this run (the rest came from the per-version cache). */
  built: number;
  cached: number;
}

interface Loaded {
  ref: PackageRef;
  surface: ModuleSurface;
  /** npm only: the types describe a possibly different version than the installed code. */
  looseTypes?: boolean;
  /** A sibling package in this repo's workspace rather than an installed version. */
  workspace?: boolean;
}

const isWorkspace = (l: Loaded): boolean => l.workspace === true || l.ref.version === 'workspace';
const versionLabel = (l: Loaded): string => (isWorkspace(l) ? 'workspace package' : `${l.ref.name === '@types/node' ? '@types/node ' : ''}${shortVersion(l.ref.version)}`);

type Lang = 'js' | 'ts' | 'python' | 'go' | 'java' | 'rust';

function langOf(f: FileFacts): Lang | null {
  switch (f.language) {
    case 'typescript': case 'tsx': return 'ts';
    case 'javascript': case 'jsx': return 'js';
    case 'python': return 'python';
    case 'go': return 'go';
    case 'java': return 'java';
    case 'rust': return 'rust';
    default: return null;
  }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ASSET = /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|json|html|txt|md|wasm|vue|svelte|graphql|gql|ya?ml)(\?.*)?$/i;

function suppressed(lines: string[], line: number): boolean {
  const here = lines[line - 1] ?? '';
  const above = lines[line - 2] ?? '';
  return /#\s*(type:\s*ignore|noqa|pyright:\s*ignore|gw:\s*ignore)|\/\/\s*(gw:\s*ignore|nolint)|@SuppressWarnings/.test(here) || /@ts-(expect-error|ignore)|gw:\s*ignore/.test(above);
}

function inRanges(line: number, ranges: [number, number][] | null | undefined): boolean {
  return !ranges || ranges.some(([a, b]) => line >= a && line <= b);
}

/** The index records a multi-line import at its first line; a changed-lines check needs the line that names the symbol. */
function nameLine(lines: string[], imp: ImportFact): number {
  if ((imp.kind !== 'named' && imp.kind !== 'reexport') || !imp.name || imp.name === '*') return imp.line;
  const name = new RegExp(`(?<![\\w$])${escapeRe(imp.name)}(?![\\w$])`);
  if (name.test(lines[imp.line - 1] ?? '')) return imp.line;
  for (let i = imp.line; i < Math.min(lines.length, imp.line + 200); i++) {
    if (name.test(lines[i]!)) return i + 1;
    if (/^\s*[})]/.test(lines[i]!)) break;
  }
  return imp.line;
}

/** The file with one import statement blanked, so the statement is not mistaken for a second binding of its own names. */
function withoutStatement(lines: string[], imp: Import): string {
  const out = [...lines];
  const closes = new RegExp(`['"\`]${escapeRe(imp.module)}['"\`]`);
  for (let i = imp.stmtLine - 1; i < Math.min(out.length, imp.stmtLine + 200); i++) {
    const line = out[i]!;
    out[i] = '';
    if (closes.test(line)) break;
  }
  return out.join('\n');
}

function npmKey(file: string, spec: string, cjs: boolean): string {
  return `npm:${path.dirname(file)}:${spec}${cjs ? ':require' : ''}`;
}

export class DependencyChecker {
  readonly stats: DepStats = { checks: 0, built: 0, cached: 0 };
  private readonly surfaces = new Map<string, Loaded | null>();
  private readonly workspaces: Workspaces;
  private sites: string[] | null = null;
  private readonly goMods = new Map<string, GoModuleRoot | null>();

  constructor(private readonly db: Db, private readonly root: string, private readonly config?: GroundworkConfig) {
    // A long-lived process (the MCP server) must see installs and manifest edits made since the last check.
    resetJavaProjects();
    resetPyVersions();
    this.workspaces = discoverWorkspaces(root, true);
  }

  private pySites(): string[] {
    return (this.sites ??= sitePackages(this.root, this.config?.deps.pythonPaths ?? []));
  }

  private store(ref: PackageRef, module: string, surface: ModuleSurface, cacheable: boolean): void {
    this.stats.built++;
    if (cacheable && this.config?.deps.cache !== false) writeCachedSurface(this.root, ref, module, surface);
  }

  private fromCache(ref: PackageRef, module: string): ModuleSurface | null {
    if (this.config?.deps.cache === false) return null;
    const hit = readCachedSurface(this.root, ref, module);
    if (hit) this.stats.cached++;
    return hit;
  }

  /** Load the npm surfaces a set of files import, building the uncached ones with a single TypeScript program. */
  async prepareNpm(files: { file: string; specifiers: string[]; cjs?: boolean }[]): Promise<void> {
    const pending: { key: string; mod: NpmModule }[] = [];
    for (const { file, specifiers, cjs = false } of files) {
      for (const spec of specifiers) {
        const key = npmKey(file, spec, cjs);
        if (this.surfaces.has(key) || pending.some((p) => p.key === key)) continue;
        const mod = ASSET.test(spec) ? null : locateNpmModule(this.root, file, spec, this.workspaces.npm, cjs);
        if (!mod) {
          this.surfaces.set(key, null);
          continue;
        }
        const cached = mod.workspace ? null : this.fromCache(mod.ref, mod.cacheKey ?? mod.ambient ?? mod.subpath);
        if (cached) this.surfaces.set(key, { ref: mod.ref, surface: cached, ...(mod.separateTypes ? { looseTypes: true } : {}), ...(mod.workspace ? { workspace: true } : {}) });
        else pending.push({ key, mod });
      }
    }
    if (!pending.length) return;
    const built = await buildNpmSurfaces(pending.map((p) => p.mod));
    pending.forEach(({ key, mod }, i) => {
      const surface = built[i]!;
      this.store(mod.ref, mod.cacheKey ?? mod.ambient ?? mod.subpath, surface, !mod.workspace);
      this.surfaces.set(key, { ref: mod.ref, surface, ...(mod.separateTypes ? { looseTypes: true } : {}), ...(mod.workspace ? { workspace: true } : {}) });
    });
  }

  private npm(file: string, spec: string, cjs = false): Loaded | null {
    return this.surfaces.get(npmKey(file, spec, cjs)) ?? null;
  }

  private async python(module: string): Promise<Loaded | null> {
    const key = `pypi:${module}`;
    if (this.surfaces.has(key)) return this.surfaces.get(key)!;
    let loaded: Loaded | null = null;
    const mod = locatePyModule(this.pySites(), module);
    if (mod) {
      let surface = this.fromCache(mod.ref, module);
      if (!surface) {
        surface = await buildPySurface(mod, this.pySites());
        this.store(mod.ref, module, surface, true);
      }
      loaded = { ref: mod.ref, surface };
    }
    this.surfaces.set(key, loaded);
    return loaded;
  }

  private goMod(file: string): GoModuleRoot | null {
    const dir = path.dirname(file);
    if (!this.goMods.has(dir)) this.goMods.set(dir, goModFor(this.root, file));
    return this.goMods.get(dir)!;
  }

  /** `'missing'`: the module is installed and has no such package directory. */
  private async go(file: string, importPath: string): Promise<Loaded | 'missing' | null> {
    const mod = this.goMod(file);
    if (!mod) return null;
    const key = `go:${mod.dir}:${importPath}`;
    if (this.surfaces.has(key)) return this.surfaces.get(key) ?? null;
    const pkg = locateGoPackage(this.root, mod, importPath, this.workspaces.go);
    if (!pkg) {
      this.surfaces.set(key, null);
      return null;
    }
    if (!existsSync(pkg.dir)) return pkg.local ? null : 'missing';
    let surface = pkg.local ? null : this.fromCache(pkg.ref, importPath);
    if (!surface) {
      surface = await buildGoSurface(pkg);
      this.store(pkg.ref, importPath, surface, !pkg.local);
    }
    const loaded = { ref: pkg.ref, surface };
    this.surfaces.set(key, loaded);
    return loaded;
  }

  private crate(file: string, crate: string): Loaded | null {
    const lock = cargoLock(this.root, file);
    if (!lock) return null;
    const key = `cargo:${lock.dir}:${crate}`;
    if (this.surfaces.has(key)) return this.surfaces.get(key)!;
    const ref = locateCrate(lock, crate, this.workspaces.cargo);
    let loaded: Loaded | null = null;
    if (ref) {
      const local = ref.version === 'workspace';
      let surface = local ? null : this.fromCache(ref, '');
      if (!surface) {
        surface = buildCrateSurface(ref);
        this.store(ref, '', surface, !local);
      }
      loaded = { ref, surface };
    }
    this.surfaces.set(key, loaded);
    return loaded;
  }

  /** Installed npm package names visible from the repo root and from each workspace package. */
  private npmInstalled(): { file: string; specifiers: string[] }[] {
    const out: { file: string; specifiers: string[] }[] = [];
    const seen = new Set<string>();
    for (const dir of ['', ...this.workspaces.packages.filter((p) => p.kind === 'npm').map((p) => p.dir)]) {
      const modules = path.join(this.root, dir, 'node_modules');
      const names: string[] = [];
      let entries: string[];
      try {
        entries = readdirSync(modules);
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.startsWith('.')) continue;
        if (!e.startsWith('@')) names.push(e);
        else {
          try {
            for (const sub of readdirSync(path.join(modules, e))) names.push(`${e}/${sub}`);
          } catch {
            // unreadable scope
          }
        }
      }
      // `@types/x` is read as the types of `x`, not as a package of its own.
      const specifiers = names.filter((n) => !n.startsWith('@types/') && !seen.has(`${dir}:${n}`));
      specifiers.forEach((n) => seen.add(`${dir}:${n}`));
      if (specifiers.length) out.push({ file: path.posix.join(dir.split(path.sep).join('/'), 'package.json'), specifiers });
    }
    return out;
  }

  private pyInstalled(): string[] {
    const out = new Set<string>();
    for (const site of this.pySites()) {
      let entries;
      try {
        entries = readdirSync(site, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name.startsWith('_') || e.name.startsWith('.') || /[.-](dist-info|egg-info|libs)$/.test(e.name)) continue;
        if (e.isDirectory() && /^[A-Za-z]\w*$/.test(e.name)) out.add(e.name);
        else if (/^[A-Za-z]\w*\.pyi?$/.test(e.name)) out.add(e.name.replace(/\.pyi?$/, ''));
      }
    }
    return [...out];
  }

  /** Read every installed package's entry surface into the per-version cache (`gw deps build`). */
  async buildAll(): Promise<{ packages: number; closed: number; open: number; built: number; cached: number; byEcosystem: Record<string, number> }> {
    const byEcosystem: Record<string, number> = {};
    let packages = 0;
    let open = 0;
    const count = (loaded: Loaded | null): void => {
      if (!loaded) return;
      packages++;
      byEcosystem[loaded.ref.ecosystem] = (byEcosystem[loaded.ref.ecosystem] ?? 0) + 1;
      if (loaded.surface.open) open++;
    };
    const npm = this.npmInstalled();
    await this.prepareNpm(npm);
    for (const { file, specifiers } of npm) for (const s of specifiers) count(this.npm(file, s));
    for (const module of this.pyInstalled()) count(await this.python(module).catch(() => null));
    const goFiles = new Set<string>(['go.mod', ...this.workspaces.packages.filter((p) => p.kind === 'go').map((p) => path.posix.join(p.dir.split(path.sep).join('/'), 'go.mod'))]);
    for (const file of goFiles) {
      const mod = this.goMod(file);
      if (!mod) continue;
      for (const importPath of mod.requires.keys()) {
        const loaded = await this.go(file, importPath).catch(() => null);
        count(loaded === 'missing' ? null : loaded);
      }
    }
    return { packages, closed: packages - open, open, built: this.stats.built, cached: this.stats.cached, byEcosystem };
  }

  /** The surface an import of `module` from `fromFile` would be checked against, whichever ecosystem owns it. */
  async show(module: string, fromFile = 'package.json'): Promise<{ ref: PackageRef; surface: ModuleSurface } | null> {
    if (fromFile.endsWith('.py')) return this.python(module);
    if (fromFile.endsWith('.go')) {
      const loaded = await this.go(fromFile, module);
      return loaded === 'missing' ? null : loaded;
    }
    await this.prepareNpm([{ file: fromFile, specifiers: [module] }]);
    const npm = this.npm(fromFile, module);
    if (npm) return npm;
    const py = await this.python(module);
    if (py) return py;
    const go = await this.go('go.mod', module).catch(() => null);
    return go === 'missing' ? null : go;
  }

  /** Dependency findings for one indexed file. Never throws: a failure is "nothing to report". */
  async check(rel: string, ranges?: [number, number][] | null): Promise<{ checked: boolean; findings: Finding[] }> {
    const none = { checked: false, findings: [] as Finding[] };
    try {
      const f = fileFacts(this.db, rel);
      const lang = f ? langOf(f) : null;
      if (!f || !lang || f.status !== 'ok' || f.isGenerated || rel.endsWith('.d.ts') || rel.endsWith('.pyi')) return none;
      let text: string;
      try {
        text = readFileSync(path.join(this.root, rel), 'utf8');
      } catch {
        return none;
      }
      const lines = text.split('\n');
      const imports = importFacts(this.db, f.id).filter((i) => i.resolvedFileId === null).map((i) => ({ ...i, line: nameLine(lines, i), stmtLine: i.line }));
      const calls = callFacts(this.db, f.id).filter((c) => inRanges(c.line, ranges) && !suppressed(lines, c.line));
      const ctx: Ctx = { f, rel, lang, text, lines, imports, calls, ranges, findings: [] };
      if (lang === 'js' || lang === 'ts') await this.checkJs(ctx);
      else if (lang === 'python') await this.checkPython(ctx);
      else if (lang === 'go') await this.checkGo(ctx);
      else if (lang === 'java') this.checkJava(ctx);
      else this.checkRust(ctx);
      ctx.findings.sort((a, b) => a.line - b.line);
      return { checked: true, findings: ctx.findings };
    } catch {
      return none;
    }
  }

  private importLive(ctx: Ctx, imp: Import): boolean {
    return inRanges(imp.line, ctx.ranges) && !suppressed(ctx.lines, imp.line) && !suppressed(ctx.lines, imp.stmtLine);
  }

  // ---- JavaScript / TypeScript ----

  private async checkJs(ctx: Ctx): Promise<void> {
    const external = ctx.imports.filter((i) => splitSpecifier(i.module.startsWith('node:') ? i.module.slice(5) : i.module) !== null);
    // A CommonJS consumer resolves a dual package's `require` declarations.
    const cjs = /\.c[jt]s$/.test(ctx.rel) || (/\brequire\s*\(/.test(ctx.text) && !/^\s*(?:import\s[^(]|export\s)/m.test(ctx.text));
    await this.prepareNpm([{ file: ctx.rel, specifiers: [...new Set(external.map((i) => i.module))], cjs }]);
    for (const imp of external) {
      const loaded = this.npm(ctx.rel, imp.module, cjs);
      if (!loaded || loaded.surface.open) continue;
      const { surface } = loaded;
      // Types from @types/* can lag the installed JavaScript, and plain JS tolerates loose argument counts:
      // only TypeScript files (where the compiler agrees) or bundled types make a missing name definite.
      const definite = ctx.lang === 'ts' || !loaded.looseTypes;
      if ((imp.kind === 'named' || imp.kind === 'reexport') && imp.name !== 'default' && imp.name !== '*') {
        const info = surface.exports[imp.name];
        if (this.importLive(ctx, imp)) {
          this.stats.checks++;
          if (!info) ctx.findings.push(this.missing(ctx, imp.line, 'unknown-export', imp.name, imp.module, loaded, surface.exports, definite));
          else if (info.deprecated !== undefined) ctx.findings.push(this.deprecated(ctx, imp.line, imp.name, imp.module, loaded, info));
        }
        if (info && imp.kind === 'named') this.checkJsCalls(ctx, imp.alias ?? imp.name, imp.module, loaded, info, definite, false, imp);
      } else if (imp.kind === 'namespace' || imp.kind === 'default') {
        if (!imp.alias) continue;
        const whole: ExportInfo | undefined = imp.kind === 'namespace' ? { kind: 'namespace', members: surface.exports, ...(surface.exports['export=']?.arities ? { arities: surface.exports['export=']!.arities } : {}) } : surface.exports.default;
        if (whole) this.checkJsCalls(ctx, imp.alias, imp.module, loaded, whole, definite, /\brequire\s*\(/.test(ctx.lines[imp.line - 1] ?? ''));
      }
    }
  }

  private checkJsCalls(ctx: Ctx, local: string, module: string, loaded: Loaded, info: ExportInfo, definite: boolean, viaRequire: boolean, own?: Import): void {
    // A second binding of the same name (a parameter, a local) means calls may not refer to the import.
    const rebinds = [...ctx.text.matchAll(new RegExp(`\\b(?:const|let|var|function|class)\\s+${escapeRe(local)}\\b|[(,]\\s*${escapeRe(local)}\\s*[,):=]`, 'g'))].length;
    const n = escapeRe(local);
    const params = `[^()]*\\b${n}\\b[^()]*`;
    const usedAsArg = new RegExp(
      [
        `\\b(?:const|let|var|function|class)\\s+${n}\\b`,
        // Destructured locals, parameters of functions, arrows and methods, catch bindings.
        `\\b(?:const|let|var)\\s*[{[][^=;]*\\b${n}\\b`,
        `\\bfunction\\b[^(]*\\(${params}\\)`,
        `\\(${params}\\)\\s*(?::[^=;{]+)?=>`,
        `\\b${n}\\s*=>`,
        // A plain reassignment of a `let`/`var` binding.
        `(?<![.\\w$])${n}\\s*=(?![=>])`,
        `[(,]\\s*(?:public |private |protected |readonly )*${n}\\s*\\??:`,
        `(?<!\\b(?:if|while|for|switch|with)\\s*)\\(${params}\\)\\s*(?::[^=;{]+)?\\{`,
      ].join('|'),
    ).test(own ? withoutStatement(ctx.lines, own) : ctx.text);
    if (viaRequire ? rebinds > 1 : usedAsArg) return;
    for (const call of ctx.calls) {
      if (call.calleeText === local) {
        if (!info.arities) continue;
        this.stats.checks++;
        const f = this.arity(ctx, call, local, module, loaded, info, ctx.lang === 'ts');
        if (f) ctx.findings.push(f);
        else if (info.deprecated !== undefined) ctx.findings.push(this.deprecated(ctx, call.line, local, module, loaded, info, call.column));
      } else if (call.calleeText === `${local}.${call.calleeName}` && info.members) {
        const member = info.members[call.calleeName];
        this.stats.checks++;
        if (!member) {
          // Function and object built-ins (`call`, `bind`, `toString`) exist on every value.
          if (info.kind !== 'namespace' && call.calleeName in Function.prototype) continue;
          ctx.findings.push({ ...this.missing(ctx, call.line, 'unknown-member', call.calleeName, module, loaded, info.members, definite), column: call.column });
        } else {
          const f = member.arities ? this.arity(ctx, call, `${local}.${call.calleeName}`, module, loaded, member, ctx.lang === 'ts') : null;
          if (f) ctx.findings.push(f);
          else if (member.deprecated !== undefined) ctx.findings.push(this.deprecated(ctx, call.line, call.calleeName, module, loaded, member, call.column));
        }
      }
    }
  }

  // ---- Python ----

  private async checkPython(ctx: Ctx): Promise<void> {
    for (const imp of ctx.imports) {
      if (imp.module.startsWith('.') || imp.kind === 'reexport-all') continue;
      const loaded = await this.python(imp.module);
      if (!loaded || loaded.surface.open) continue;
      const { surface } = loaded;
      const known = (name: string): boolean => name in surface.exports || (surface.mentions ?? []).includes(name) || name.startsWith('__');
      // try/except ImportError around the import is the idiom for an optional name.
      const optional = /^\s*(try\s*:|except\b)/.test(ctx.lines[imp.stmtLine - 2] ?? '') || /^\s*try\s*:/.test(ctx.lines[imp.stmtLine - 3] ?? '');
      if (imp.kind === 'named') {
        if (this.importLive(ctx, imp) && !optional) {
          this.stats.checks++;
          if (!known(imp.name)) ctx.findings.push(this.missing(ctx, imp.line, 'unknown-export', imp.name, imp.module, loaded, surface.exports, true));
        }
        const info = surface.exports[imp.name];
        const local = imp.alias ?? imp.name;
        if (!info?.arities || this.pyRebound(ctx, local)) continue;
        for (const call of ctx.calls) {
          if (call.calleeText !== local) continue;
          this.stats.checks++;
          const f = this.arity(ctx, call, local, imp.module, loaded, info, true);
          if (f) ctx.findings.push(f);
        }
      } else if (imp.kind === 'module') {
        const local = imp.alias ?? imp.module;
        if (this.pyRebound(ctx, local.split('.')[0]!)) continue;
        for (const call of ctx.calls) {
          if (call.calleeText !== `${local}.${call.calleeName}`) continue;
          // The file sets this attribute on the module itself (a monkeypatch): it exists by the time it is called.
          if (new RegExp(`\\b${escapeRe(local)}\\.${escapeRe(call.calleeName)}\\s*(?::[^=\\n]+)?=(?!=)|\\bsetattr\\(\\s*${escapeRe(local)}\\s*,`).test(ctx.text)) continue;
          this.stats.checks++;
          const info = surface.exports[call.calleeName];
          if (!known(call.calleeName)) ctx.findings.push({ ...this.missing(ctx, call.line, 'unknown-member', call.calleeName, imp.module, loaded, surface.exports, true), column: call.column });
          else if (info?.arities) {
            const f = this.arity(ctx, call, `${local}.${call.calleeName}`, imp.module, loaded, info, true);
            if (f) ctx.findings.push(f);
          }
        }
      }
    }
  }

  private pyRebound(ctx: Ctx, local: string): boolean {
    const n = escapeRe(local);
    return new RegExp(`^\\s*(?:${n}\\s*(?::[^=\\n]+)?=(?!=)|def\\s+${n}\\b|class\\s+${n}\\b|for\\s+${n}\\b|global\\s+${n}\\b)|\\bas\\s+${n}\\s*:|[(,]\\s*${n}\\s*[,):=]`, 'm').test(ctx.text);
  }

  // ---- Go ----

  private async checkGo(ctx: Ctx): Promise<void> {
    for (const imp of ctx.imports) {
      if (imp.alias === '_' || imp.alias === '.') continue;
      const loaded = await this.go(ctx.rel, imp.module);
      if (loaded === 'missing') {
        if (!this.importLive(ctx, imp)) continue;
        this.stats.checks++;
        ctx.findings.push({ file: ctx.rel, line: imp.line, kind: 'missing-module', name: imp.module, message: `package '${imp.module}' does not exist in the installed version of its module.`, blocking: true, suggestions: [] });
        continue;
      }
      if (!loaded || loaded.surface.open) continue;
      const { surface } = loaded;
      const local = imp.alias ?? surface.name;
      if (!local || this.goRebound(ctx, local)) continue;
      for (const call of ctx.calls) {
        if (call.calleeText !== `${local}.${call.calleeName}`) continue;
        this.stats.checks++;
        const info = surface.exports[call.calleeName];
        if (!info) {
          if ((surface.mentions ?? []).includes(call.calleeName) || !/^[A-Z]/.test(call.calleeName)) continue;
          ctx.findings.push({ ...this.missing(ctx, call.line, 'unknown-member', call.calleeName, imp.module, loaded, surface.exports, true), column: call.column });
        } else if (info.arities) {
          // `f(g())` spreads a multi-value result, so one argument can stand for several.
          if (call.argCount === 1 && !arityAllows(info.arities, 1) && info.arities.every(([min]) => min > 1)) continue;
          const f = this.arity(ctx, call, `${local}.${call.calleeName}`, imp.module, loaded, info, true);
          if (f) ctx.findings.push(f);
          else if (info.deprecated !== undefined) ctx.findings.push(this.deprecated(ctx, call.line, call.calleeName, imp.module, loaded, info, call.column));
        } else if (info.deprecated !== undefined) ctx.findings.push(this.deprecated(ctx, call.line, call.calleeName, imp.module, loaded, info, call.column));
      }
    }
  }

  private goRebound(ctx: Ctx, local: string): boolean {
    const n = escapeRe(local);
    return new RegExp(`\\b${n}\\s*(?:,\\s*\\w+\\s*)*:=|\\w+\\s*,\\s*${n}\\s*:=|\\bvar\\s+${n}\\b|[(,]\\s*${n}\\s+[\\w*\\[\\].]+\\s*[,)]|\\bfunc\\s*\\(\\s*${n}\\s`).test(ctx.text);
  }

  // ---- Java ----

  private checkJava(ctx: Ctx): void {
    const project = javaProject(this.root, ctx.rel);
    if (!project) return;
    for (const imp of ctx.imports) {
      if (imp.kind !== 'named' || !/^[A-Z]\w*$/.test(imp.name) || !/^[a-z_][\w.]*$/.test(imp.module)) continue;
      const hit = findJavaClass(project, imp.module, imp.name);
      if (!hit) continue;
      const loaded: Loaded = { ref: hit.ref, surface: { exports: Object.fromEntries(hit.siblings.map((s) => [s, { kind: 'class' as const }])), open: false } };
      if (!hit.info) {
        if (!this.importLive(ctx, imp)) continue;
        this.stats.checks++;
        // A declared dependency whose JAR is not on this machine could still own part of this package.
        ctx.findings.push(this.missing(ctx, imp.line, 'unknown-export', imp.name, imp.module, loaded, loaded.surface.exports, project.missing === 0));
        continue;
      }
      if (this.importLive(ctx, imp)) {
        this.stats.checks++;
        if (hit.info.deprecated) ctx.findings.push(this.deprecated(ctx, imp.line, imp.name, imp.module, loaded, { kind: 'class', deprecated: '' }));
      }
      const surface = javaClassSurface(project, hit.info);
      const cls: Loaded = { ref: hit.ref, surface };
      const qualified = `${imp.module}.${imp.name}`;
      const nested = (name: string): boolean => project.jars[hit.jarIndex]!.jar.entries.has(`${qualified.replaceAll('.', '/')}$${name}.class`);
      for (const call of ctx.calls) {
        const text = call.calleeText.replace(/<[^>]*>$/, '');
        if (text === imp.name) {
          const ctor = surface.exports.new;
          if (!ctor?.arities) continue;
          this.stats.checks++;
          const f = this.arity(ctx, call, `new ${imp.name}`, qualified, cls, ctor, true);
          if (f) ctx.findings.push(f);
        } else if (text === `${imp.name}.${call.calleeName}`) {
          const info = surface.exports[call.calleeName];
          this.stats.checks++;
          if (!info) {
            if (surface.open || nested(call.calleeName)) continue;
            const { new: _ctor, ...members } = surface.exports;
            ctx.findings.push({ ...this.missing(ctx, call.line, 'unknown-member', call.calleeName, qualified, cls, members, true), column: call.column });
          } else if (info.arities) {
            // An unlisted parent may add overloads, so the known arities are not the whole set.
            const f = surface.open ? null : this.arity(ctx, call, `${imp.name}.${call.calleeName}`, qualified, cls, info, true);
            if (f) ctx.findings.push(f);
            else if (info.deprecated !== undefined) ctx.findings.push(this.deprecated(ctx, call.line, call.calleeName, qualified, cls, info, call.column));
          }
        }
      }
    }
  }

  // ---- Rust (warnings only) ----

  private checkRust(ctx: Ctx): void {
    for (const imp of ctx.imports) {
      const segments = imp.module.split('::').filter(Boolean);
      const crate = segments[0] ?? imp.name;
      if (!crate || ['std', 'core', 'alloc', 'crate', 'self', 'super', 'proc_macro', 'test'].includes(crate) || imp.name === '*') continue;
      if (!this.importLive(ctx, imp)) continue;
      const loaded = this.crate(ctx.rel, crate);
      if (!loaded || loaded.surface.open) continue;
      const name = imp.name === 'self' ? segments.at(-1)! : imp.name;
      if (name === crate) continue;
      this.stats.checks++;
      if ((loaded.surface.mentions ?? []).includes(name)) continue;
      ctx.findings.push({
        file: ctx.rel, line: imp.line, kind: 'unknown-export', name,
        message: `crate \`${loaded.ref.name}\` (${versionLabel(loaded)}) never mentions \`${name}\`; check the import path.`,
        blocking: false, suggestions: [],
      });
    }
  }

  // ---- Findings ----

  private alternatives(name: string, pool: Record<string, ExportInfo>, loaded: Loaded): Suggestion[] {
    const scored: Suggestion[] = [];
    for (const [candidate, info] of Object.entries(pool)) {
      if (candidate === name || candidate === 'default' || candidate === 'export=' || candidate === 'new' || info.deprecated !== undefined) continue;
      const score = nameSimilarity(name, candidate);
      if (score < 0.55) continue;
      scored.push({ name: candidate, qualifiedName: candidate, file: `${loaded.ref.name}@${loaded.ref.version}`, line: 0, signature: info.signature ?? '', score: Math.round(score * 100) / 100 });
    }
    return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 3);
  }

  private missing(ctx: Ctx, line: number, kind: 'unknown-export' | 'unknown-member', name: string, module: string, loaded: Loaded, pool: Record<string, ExportInfo>, definite: boolean): Finding {
    const suggestions = this.alternatives(name, pool, loaded);
    const version = versionLabel(loaded);
    const message = suggestions.length
      ? `${module} has no \`${name}\`; ${isWorkspace(loaded) ? 'it' : 'installed version'} has ${suggestions.map((s) => `\`${s.name}\``).join(', ')} (${version}).`
      : `${module} (${version}) has no \`${name}\`.`;
    return { file: ctx.rel, line, kind, name, message, blocking: definite, suggestions };
  }

  private arity(ctx: Ctx, call: CallFact, shown: string, module: string, loaded: Loaded, info: ExportInfo, definite: boolean): Finding | null {
    if (call.hasSpread || !info.arities?.length) return null;
    const given = ctx.lang === 'python' ? call.argCount + call.keywordArgs.length : call.argCount;
    if (arityAllows(info.arities, given)) return null;
    const version = versionLabel(loaded);
    const expects = arityText(info.arities);
    return {
      file: ctx.rel, line: call.line, column: call.column, kind: 'arity', name: shown,
      message: `${shown} takes ${expects} argument${expects === '1' ? '' : 's'}, got ${given} (${module} ${version}${info.signature ? `: ${info.signature}` : ''}).`,
      blocking: definite, suggestions: [],
    };
  }

  private deprecated(ctx: Ctx, line: number, name: string, module: string, loaded: Loaded, info: ExportInfo, column?: number): Finding {
    const note = info.deprecated ? ` ${info.deprecated.replace(/\.$/, '')}.` : '';
    return {
      file: ctx.rel, line, ...(column !== undefined ? { column } : {}), kind: 'deprecated', name,
      message: `\`${name}\` is deprecated in ${module} ${versionLabel(loaded)}.${note}`,
      blocking: false, suggestions: [],
    };
  }
}

type Import = ImportFact & { stmtLine: number };

interface Ctx {
  f: FileFacts;
  rel: string;
  lang: Lang;
  text: string;
  lines: string[];
  /** `line` is where the name is written; `stmtLine` is where its import statement starts. */
  imports: Import[];
  calls: CallFact[];
  ranges: [number, number][] | null | undefined;
  findings: Finding[];
}

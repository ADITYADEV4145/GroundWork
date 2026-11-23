import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CallConfidence } from '../types.js';
import type { FileInfo, Resolution } from './imports.js';

export const ADDITIONAL_LANGUAGES = new Set(['go', 'rust', 'java', 'csharp', 'ruby']);
export interface AdditionalImport { module: string; name: string; alias: string | null; kind: string }
export interface AdditionalSymbol { id: string; fileId: number; name: string; qualifiedName: string; kind: string; parentId: string | null }

export class AdditionalResolver {
  private readonly module: string | null;
  constructor(root: string, private readonly files: FileInfo[]) {
    const mod = path.join(root, 'go.mod');
    this.module = existsSync(mod) ? /^\s*module\s+(\S+)/m.exec(readFileSync(mod, 'utf8'))?.[1]?.replace(/^"|"$/g, '') ?? null : null;
  }

  private readonly byId = new Map<number, FileInfo>();
  private readonly byLanguage = new Map<string, FileInfo[]>();
  private readonly byPath = new Map<string, FileInfo>();
  private readonly goDirs = new Map<string, FileInfo[]>();
  private readonly targetCache = new Map<string, FileInfo[]>();
  private indexed: { symbols: AdditionalSymbol[]; same: Map<string, AdditionalSymbol[]>; named: Map<string, AdditionalSymbol[]>; byId: Map<string, AdditionalSymbol> } | null = null;

  private prepare(): void {
    if (this.byId.size || !this.files.length) return;
    for (const f of this.files) {
      this.byId.set(f.id, f);
      this.byPath.set(f.path, f);
      const language = f.language ?? '';
      if (!this.byLanguage.has(language)) this.byLanguage.set(language, []);
      this.byLanguage.get(language)!.push(f);
      if (language !== 'go') continue;
      const dir = path.posix.dirname(f.path);
      if (!this.goDirs.has(dir)) this.goDirs.set(dir, []);
      this.goDirs.get(dir)!.push(f);
    }
  }

  private symbolIndex(symbols: AdditionalSymbol[]) {
    if (this.indexed?.symbols === symbols) return this.indexed;
    this.prepare();
    const same = new Map<string, AdditionalSymbol[]>(), named = new Map<string, AdditionalSymbol[]>(), byId = new Map<string, AdditionalSymbol>();
    for (const s of symbols) {
      if (!['function', 'method', 'class'].includes(s.kind)) continue;
      const language = this.byId.get(s.fileId)?.language;
      if (!language) continue;
      if (!same.has(language)) same.set(language, []);
      same.get(language)!.push(s);
      const key = `${language}\0${s.name}`;
      if (!named.has(key)) named.set(key, []);
      named.get(key)!.push(s);
      if (!byId.has(`${language}\0${s.id}`)) byId.set(`${language}\0${s.id}`, s);
    }
    return (this.indexed = { symbols, same, named, byId });
  }

  private suffix(language: string, suffixes: string[]): FileInfo[] {
    return (this.byLanguage.get(language) ?? []).filter((f) => suffixes.some((s) => f.path === s || f.path.endsWith('/' + s)));
  }

  private rustFiles(from: FileInfo, spec: string): FileInfo[] {
    const parts = spec.split('::');
    let base: string;
    if (parts[0] === 'crate') { base = 'src'; parts.shift(); }
    else {
      base = /\/(mod|lib|main)\.rs$/.test(from.path) ? path.posix.dirname(from.path) : from.path.replace(/\.rs$/, '');
      if (parts[0] === 'self') parts.shift();
      while (parts[0] === 'super') { base = path.posix.dirname(base); parts.shift(); }
    }
    const stem = path.posix.join(base, ...parts);
    const wanted = [stem + '.rs', stem + '/mod.rs', ...(parts.length ? [] : [base + '/lib.rs', base + '/main.rs'])];
    return (this.byLanguage.get('rust') ?? []).filter((f) => wanted.includes(f.path));
  }

  targets(from: FileInfo, im: AdditionalImport): FileInfo[] {
    this.prepare();
    const key = `${from.id}\0${im.module}\0${im.name}\0${im.kind}`;
    let cached = this.targetCache.get(key);
    if (!cached) this.targetCache.set(key, (cached = this.findTargets(from, im)));
    return cached;
  }

  private findTargets(from: FileInfo, im: AdditionalImport): FileInfo[] {
    if (from.language === 'go') {
      const local = this.module && (im.module === this.module || im.module.startsWith(this.module + '/')) ? im.module.slice(this.module.length).replace(/^\//, '') || '.' : null;
      if (local === null && (this.module || !/^\.\.?\//.test(im.module))) return [];
      const target = local ?? path.posix.normalize(path.posix.join(path.posix.dirname(from.path), im.module));
      if (target === '..' || target.startsWith('../') || path.posix.isAbsolute(target)) return [];
      return this.goDirs.get(target) ?? [];
    }
    if (from.language === 'java') {
      const full = [im.module, im.name === '*' ? '' : im.name].filter(Boolean).join('.').replace(/\./g, '/');
      const direct = this.suffix('java', [full + '.java']);
      return direct.length ? direct : this.suffix('java', [im.module.replace(/\./g, '/') + '.java']);
    }
    if (from.language === 'ruby') {
      const stem = im.module.replace(/\.rb$/, '');
      if (im.kind === 'side-effect') {
        const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from.path), stem + '.rb'));
        return (this.byLanguage.get('ruby') ?? []).filter((f) => f.path === rel);
      }
      const lib = (this.byLanguage.get('ruby') ?? []).filter((f) => f.path === `lib/${stem}.rb`);
      return lib.length ? lib : this.suffix('ruby', [stem + '.rb']);
    }
    if (from.language === 'rust') {
      const spec = [im.module, im.name === '*' ? '' : im.name].filter(Boolean).join('::');
      const direct = this.rustFiles(from, spec);
      return direct.length ? direct : this.rustFiles(from, im.module);
    }
    return [];
  }

  resolveImport(from: FileInfo, im: AdditionalImport): Resolution {
    const targets = this.targets(from, im);
    const unique = from.language === 'go' ? targets.length > 0 : targets.length === 1;
    return unique ? { fileId: [...targets].sort((a, b) => a.path.localeCompare(b.path))[0]!.id, reason: null } : { fileId: null, reason: 'external' };
  }

  resolveCall(from: FileInfo, callerId: string | null, text: string, name: string, imports: AdditionalImport[], symbols: AdditionalSymbol[]): { id: string; conf: CallConfidence } | null {
    const index = this.symbolIndex(symbols), language = from.language ?? '';
    const same = index.same.get(language) ?? [];
    const pick = (candidates: AdditionalSymbol[], conf: CallConfidence) => candidates.length === 1 ? { id: candidates[0]!.id, conf } : null;
    const named = index.named.get(`${language}\0${name}`) ?? [];
    const qualified = /\.|::/.test(text);
    const caller = callerId === null ? undefined : index.byId.get(`${language}\0${callerId}`);
    if (/^(this|self)\.[^.]+$/.test(text) && caller?.parentId) return pick(named.filter((s) => s.parentId === caller.parentId), 'exact');
    if (!qualified) {
      const local = named.filter((s) => s.fileId === from.id && (s.parentId === null || (caller?.parentId && s.parentId === caller.parentId)));
      if (local.length) return pick(local, 'exact');
    }
    const imported: AdditionalSymbol[] = [];
    let bound = false;
    for (const im of imports) {
      const head = text.split(/::|\./)[0]!;
      const alias = im.alias ?? (from.language === 'go' ? im.module.split('/').at(-1)! : im.name);
      const matches = from.language === 'ruby' ? !qualified : qualified ? alias === head : alias === name || im.name === '*' || im.alias === '.';
      if (!matches || im.alias === '_') continue;
      bound = true;
      const targets = this.targets(from, im);
      if (from.language === 'ruby' && targets.length > 1) return null;
      if (from.language !== 'go' && targets.length !== 1) continue;
      const ids = new Set(targets.map((f) => f.id));
      const targetName = !qualified && im.alias && im.alias !== '.' ? im.name : name;
      imported.push(...(index.named.get(`${language}\0${targetName}`) ?? []).filter((s) => ids.has(s.fileId)));
    }
    if (imported.length) return pick([...new Map(imported.map((s) => [s.id, s])).values()], 'import-resolved');
    if (bound && from.language !== 'ruby') return null;
    if (from.language === 'rust' && /^(crate|super|self)::/.test(text)) {
      const module = text.split('::').slice(0, -1).join('::');
      const targets = this.rustFiles(from, module);
      if (targets.length !== 1) return null;
      return pick(named.filter((s) => s.fileId === targets[0]!.id), 'import-resolved');
    }
    if (qualified) {
      const head = text.split(/::|\./)[0]!;
      const classes = (index.named.get(`${language}\0${head}`) ?? []).filter((s) => s.kind === 'class');
      if (classes.length === 1) return pick(named.filter((s) => s.parentId === classes[0]!.id), 'exact');
      return null;
    }
    const directory = named.filter((s) => path.posix.dirname(this.byId.get(s.fileId)!.path) === path.posix.dirname(from.path));
    if (directory.length) return pick(directory, 'name-only');
    return pick(named, 'name-only');
  }
}

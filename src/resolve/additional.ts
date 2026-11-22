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

  private suffix(language: string, suffixes: string[]): FileInfo[] {
    return this.files.filter((f) => f.language === language && suffixes.some((s) => f.path === s || f.path.endsWith('/' + s)));
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
    return this.files.filter((f) => f.language === 'rust' && [stem + '.rs', stem + '/mod.rs', ...(parts.length ? [] : [base + '/lib.rs', base + '/main.rs'])].includes(f.path));
  }

  targets(from: FileInfo, im: AdditionalImport): FileInfo[] {
    if (from.language === 'go') {
      const dirs = new Set(this.files.filter((f) => f.language === 'go').map((f) => path.posix.dirname(f.path)));
      const local = this.module && (im.module === this.module || im.module.startsWith(this.module + '/')) ? im.module.slice(this.module.length).replace(/^\//, '') || '.' : null;
      if (local === null && (this.module || !im.module.startsWith('./'))) return [];
      const target = local ?? path.posix.normalize(path.posix.join(path.posix.dirname(from.path), im.module));
      const matches = [...dirs].filter((d) => d === target);
      if (matches.length !== 1) return [];
      return this.files.filter((f) => f.language === 'go' && path.posix.dirname(f.path) === matches[0]);
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
        return this.files.filter((f) => f.language === 'ruby' && f.path === rel);
      }
      const lib = this.files.filter((f) => f.language === 'ruby' && f.path === `lib/${stem}.rb`);
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
    const same = symbols.filter((s) => this.files.find((f) => f.id === s.fileId)?.language === from.language && ['function', 'method', 'class'].includes(s.kind));
    const pick = (candidates: AdditionalSymbol[], conf: CallConfidence) => candidates.length === 1 ? { id: candidates[0]!.id, conf } : null;
    const named = same.filter((s) => s.name === name);
    const qualified = /\.|::/.test(text);
    const caller = same.find((s) => s.id === callerId);
    if (/^(this|self)\./.test(text) && caller?.parentId) return pick(named.filter((s) => s.parentId === caller.parentId), 'exact');
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
      imported.push(...same.filter((s) => ids.has(s.fileId) && s.name === targetName));
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
      const classes = same.filter((s) => s.name === head && s.kind === 'class');
      if (classes.length === 1) return pick(named.filter((s) => s.parentId === classes[0]!.id), 'exact');
      return null;
    }
    const directory = named.filter((s) => path.posix.dirname(this.files.find((f) => f.id === s.fileId)!.path) === path.posix.dirname(from.path));
    if (directory.length) return pick(directory, 'name-only');
    return pick(named, 'name-only');
  }
}

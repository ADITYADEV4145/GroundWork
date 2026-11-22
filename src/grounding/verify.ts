import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import ignore from 'ignore';
import type { GroundworkConfig } from '../config/schema.js';
import {
  callFacts,
  exportAliasFacts,
  fileFacts,
  importFacts,
  memberFacts,
  suggestionPool,
  symbolFact,
  topLevelFacts,
  type CallFact,
  type FileFacts,
  type ImportFact,
  type SymbolFact,
} from '../index/query.js';
import type { Db } from '../store/db.js';
import { renderSuggestions, suggest, type Suggestion } from './suggest.js';

// Grounding (Phase 4): flag imports, calls and arguments the agent invented. Precision first: every rule
// only fires when the index proves the error; anything dynamic, unparsed, external or ambiguous is skipped.

export type FindingKind = 'missing-module' | 'unknown-export' | 'unknown-member' | 'arity' | 'unknown-keyword' | 'type';

export interface Finding {
  file: string;
  line: number;
  column?: number;
  kind: FindingKind;
  name: string;
  message: string;
  /** Definite errors the Stop gate / `gw check` may block on. */
  blocking: boolean;
  suggestions: Suggestion[];
  typeConfirmed?: boolean;
}

export interface VerifyResult {
  file: string;
  /** Set when the file could not be checked (and so nothing in it was flagged). */
  unchecked: string | null;
  findings: Finding[];
}

export type LineRange = [number, number];

export interface VerifyOptions {
  config?: GroundworkConfig;
  /** Only report findings on these 1-based inclusive line ranges (the lines the agent just changed). */
  ranges?: LineRange[] | null;
}

const CALLABLE = new Set(['function', 'method', 'class', 'component', 'dataclass']);
const POOL_KINDS = ['function', 'method', 'class', 'component', 'dataclass', 'constant', 'variable', 'interface', 'type', 'enum'] as const;
const SAFE_PY_DECORATORS = new Set(['staticmethod', 'classmethod', 'abstractmethod', 'abc.abstractmethod', 'override', 'typing.override', 'typing_extensions.override']);
export const DYNAMIC_TEXT = /\b(setattr|__getattr__|__getattribute__|Proxy|Reflect\.|Object\.assign|Object\.defineProperty|defineProperty|mixin|Mixin|prototype)\b/;
type Lookup = SymbolFact | 'module' | 'unknown' | null;

const isTs = (f: FileFacts) => f.language === 'typescript' || f.language === 'tsx';
const isPy = (f: FileFacts) => f.language === 'python';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function inRanges(line: number, ranges: LineRange[] | null | undefined, endLine = line): boolean {
  if (!ranges) return true;
  return ranges.some(([a, b]) => line <= b && endLine >= a);
}

export class Grounder {
  private files = new Map<number, FileFacts | null>();
  private texts = new Map<string, string | null>();
  private tops = new Map<number, SymbolFact[]>();
  private members = new Map<string, SymbolFact[]>();
  private imports = new Map<number, ImportFact[]>();
  private aliases = new Map<number, { local: string; exported: string }[]>();
  private pool: SymbolFact[] | null = null;

  constructor(
    private readonly db: Db,
    private readonly root: string,
  ) {}

  file(id: number): FileFacts | null {
    if (!this.files.has(id)) this.files.set(id, fileFacts(this.db, id));
    return this.files.get(id) ?? null;
  }
  text(rel: string): string | null {
    if (!this.texts.has(rel)) {
      let t: string | null = null;
      try {
        t = readFileSync(path.join(this.root, rel), 'utf8');
      } catch {
        // deleted or unreadable
      }
      this.texts.set(rel, t);
    }
    return this.texts.get(rel) ?? null;
  }
  top(fileId: number): SymbolFact[] {
    let t = this.tops.get(fileId);
    if (!t) this.tops.set(fileId, (t = topLevelFacts(this.db, fileId)));
    return t;
  }
  membersOf(id: string): SymbolFact[] {
    let m = this.members.get(id);
    if (!m) this.members.set(id, (m = memberFacts(this.db, id)));
    return m;
  }
  importsOf(fileId: number): ImportFact[] {
    let i = this.imports.get(fileId);
    if (!i) this.imports.set(fileId, (i = importFacts(this.db, fileId)));
    return i;
  }
  aliasesOf(fileId: number) {
    let a = this.aliases.get(fileId);
    if (!a) this.aliases.set(fileId, (a = exportAliasFacts(this.db, fileId)));
    return a;
  }
  suggestionPool(): SymbolFact[] {
    return (this.pool ??= suggestionPool(this.db, [...POOL_KINDS]));
  }
  private symText(s: SymbolFact): string {
    return Buffer.from(this.text(s.file) ?? '', 'utf8').subarray(s.startByte, s.endByte).toString('utf8');
  }

  /**
   * What `name` exported from `fileId` is. `null` only when the file is fully indexed and nothing (symbol,
   * alias, re-export, star export, text mention for languages we parse loosely) could provide it.
   */
  exportOf(fileId: number, name: string, depth = 0): Lookup {
    const f = this.file(fileId);
    if (!f || f.status !== 'ok' || depth > 8) return 'unknown';
    const text = this.text(f.path);
    if (text === null) return 'unknown';
    if (isPy(f)) return this.pyExportOf(f, name, text, depth);
    if (!isTs(f) || f.path.endsWith('.d.ts')) {
      // JS (CommonJS, assigned exports) and declaration files: only trust a missing name when it is not in the text at all.
      return new RegExp(`\\b${escapeRe(name)}\\b`).test(text) ? 'unknown' : null;
    }
    if (/\bexport\s*=|module\.exports|\bexports\./.test(text)) return 'unknown';
    const tops = this.top(fileId);
    if (name === 'default') {
      const d = tops.find((s) => s.isDefaultExport);
      if (d) return d;
      if (this.importsOf(fileId).some((i) => (i.kind === 'reexport' && (i.alias ?? i.name) === 'default') || (i.kind === 'reexport-all' && /\bdefault\b/.test(i.alias ?? ''))))
        return 'unknown';
      // Test with and without comments: stripping can misfire on `//` inside strings, so either match is enough.
      const re = /\bexport\s+default\b|\bas\s*['"]?default\b|\bexport\s*\{[^}]*\bdefault\b/;
      return re.test(text) || re.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ')) ? 'unknown' : null;
    }
    const local = this.aliasesOf(fileId).find((a) => a.exported === name)?.local ?? name;
    const own = tops.find((s) => s.exported && s.name === local);
    if (own) return own;
    let unknown = false;
    for (const imp of this.importsOf(fileId)) {
      if (imp.kind === 'reexport' && (imp.alias ?? imp.name) === name) {
        if (imp.resolvedFileId === null) return 'unknown';
        const r = this.exportOf(imp.resolvedFileId, imp.name, depth + 1);
        if (r) return r;
        unknown = true;
      } else if (imp.kind === 'reexport-all') {
        if (imp.resolvedFileId === null) unknown = true;
        else {
          const r = this.exportOf(imp.resolvedFileId, name, depth + 1);
          if (r === 'unknown') unknown = true;
          else if (r) return r;
        }
      } else if ((imp.alias ?? imp.name) === local && imp.kind !== 'side-effect') {
        // `import { x } from './a'; export { x }`.
        if (new RegExp(`export\\s*(type\\s*)?\\{[^}]*\\b${escapeRe(local)}\\b`).test(text)) return 'unknown';
      }
    }
    if (unknown) return 'unknown';
    // Shapes the extractor does not model (`export const { a } = o`, `export namespace`, `declare`): if the
    // name appears on an export line, do not call it missing.
    if (new RegExp(`^[^\\n]*\\bexport\\b[^\\n]*\\b${escapeRe(name)}\\b`, 'm').test(text)) return 'unknown';
    return null;
  }

  private pyExportOf(f: FileFacts, name: string, text: string, depth: number): Lookup {
    const tops = this.top(f.id);
    const own = tops.find((s) => s.name === name);
    if (own) return own;
    for (const imp of this.importsOf(f.id)) {
      if ((imp.alias ?? imp.name) === name || imp.kind === 'reexport-all' || (imp.kind !== 'module' && imp.name === '*')) return 'unknown';
    }
    if (tops.some((s) => s.name === '__getattr__')) return 'unknown';
    // A submodule of a package: `from pkg import mod`.
    if (/(^|\/)__init__\.pyi?$/.test(f.path)) {
      const dir = path.join(this.root, path.dirname(f.path));
      if (existsSync(path.join(dir, `${name}.py`)) || existsSync(path.join(dir, `${name}.pyi`)) || existsSync(path.join(dir, name))) return 'module';
    }
    // Tuple assignment, for loops, globals(), exec: any textual mention means we cannot prove absence.
    void depth;
    return new RegExp(`\\b${escapeRe(name)}\\b`).test(text) ? 'unknown' : null;
  }

  /** Bind an identifier used in `fileId` to a repo symbol or module file. */
  bind(fileId: number, name: string): { sym?: SymbolFact; moduleFileId?: number } | 'unknown' {
    const local = this.top(fileId).find((s) => s.name === name);
    if (local) return { sym: local };
    for (const imp of this.importsOf(fileId)) {
      if (imp.kind === 'reexport' || imp.kind === 'reexport-all' || imp.kind === 'side-effect') continue;
      const bound = imp.alias ?? (imp.kind === 'module' ? imp.module.split('.')[0]! : imp.name);
      if (bound !== name) continue;
      if (imp.resolvedFileId === null) return 'unknown';
      const from = this.file(fileId);
      if (!from || !this.trusted(from, imp)) return 'unknown';
      if (imp.kind === 'namespace' || (imp.kind === 'module' && (imp.alias || !imp.module.includes('.')))) return { moduleFileId: imp.resolvedFileId };
      if (imp.kind === 'module') return 'unknown';
      if (this.isPyModuleItself(imp)) return { moduleFileId: imp.resolvedFileId };
      const r = this.exportOf(imp.resolvedFileId, imp.kind === 'default' ? 'default' : imp.name);
      if (r === 'module') {
        const sub = this.pySubmodule(imp.resolvedFileId, imp.name);
        return sub === null ? 'unknown' : { moduleFileId: sub };
      }
      if (r && r !== 'unknown') return { sym: r };
      return 'unknown';
    }
    return 'unknown';
  }

  /**
   * A Python absolute import the resolver matched by path suffix (`import types` -> src/click/types.py) is only
   * trusted when the matched root is a sys.path-like directory, not the inside of another package.
   */
  trusted(from: FileFacts, imp: ImportFact): boolean {
    if (!isPy(from) || imp.module.startsWith('.') || imp.resolvedFileId === null) return true;
    const f = this.file(imp.resolvedFileId);
    if (!f) return false;
    const mod = imp.module.split('.').join('/');
    const tails = [`${mod}.py`, `${mod}.pyi`, `${mod}/__init__.py`, `${mod}/${imp.name}.py`, `${mod}/${imp.name}/__init__.py`];
    const tail = tails.find((t) => f.path === t || f.path.endsWith(`/${t}`));
    if (!tail) return false;
    const rootDir = f.path.slice(0, f.path.length - tail.length);
    return !existsSync(path.join(this.root, rootDir, '__init__.py'));
  }

  /** How many times `name` is bound in a file: definitions, assignments, imports. More than one: scopes we cannot see. */
  private bindingCache = new Map<string, number>();
  bindings(text: string, name: string): number {
    const key = `${text.length}:${name}`;
    const hit = this.bindingCache.get(key);
    if (hit !== undefined) return hit;
    const n = escapeRe(name);
    const re = new RegExp(
      `\\b(function\\*?|def|class|const|let|var)\\s+${n}\\b|^[ \\t]*${n}\\s*(:[^=\\n]*)?=(?!=)|\\bas\\s+${n}\\b|^[ \\t]*(import|from)\\b[^\\n]*[\\s{,]${n}\\b(?!\\s+as\\b)`,
      'gm',
    );
    const count = text.match(re)?.length ?? 0;
    this.bindingCache.set(key, count);
    return count;
  }

  /** `from pkg import mod` resolved straight to pkg/mod.py. */
  private isPyModuleItself(imp: ImportFact): boolean {
    const f = imp.resolvedFileId === null ? null : this.file(imp.resolvedFileId);
    return !!f && isPy(f) && /(^|\/)([^/]+)(\.pyi?|\/__init__\.pyi?)$/.exec(f.path)?.[2] === imp.name;
  }

  private pySubmodule(pkgInitFileId: number, name: string): number | null {
    const f = this.file(pkgInitFileId);
    if (!f) return null;
    const dir = path.posix.dirname(f.path);
    for (const cand of [`${dir}/${name}.py`, `${dir}/${name}/__init__.py`]) {
      const ff = fileFacts(this.db, cand);
      if (ff) return ff.id;
    }
    return null;
  }

  /**
   * Does class `cls` (or a base we can resolve) define `member`? 'unknown' when the class is open: dynamic
   * attribute hooks, decorators that may add members, unresolvable bases, or a textual declaration we do not model.
   */
  hasMember(cls: SymbolFact, member: string, depth = 0): boolean | 'unknown' {
    if (depth > 8) return 'unknown';
    const f = this.file(cls.fileId);
    if (!f || f.status !== 'ok') return 'unknown';
    if (this.membersOf(cls.id).some((m) => m.name === member)) return true;
    const body = this.symText(cls);
    if (!body || DYNAMIC_TEXT.test(body)) return 'unknown';
    if (cls.decorators.some((d) => !/^(dataclass|dataclasses\.dataclass)\b/.test(d))) return 'unknown';
    // Fields, parameter properties, abstract signatures, `self.x = ...`, class attributes, index signatures.
    if (new RegExp(`(?<![.\\w$])${escapeRe(member)}\\b|(this|self|cls)\\.${escapeRe(member)}\\s*=(?!=)`).test(body)) return 'unknown';
    if (/\[\s*[\w$]+\s*:\s*(string|number|PropertyKey)/.test(body)) return 'unknown';
    const bases = this.basesOf(cls, f, body);
    if (bases === 'unknown') return 'unknown';
    let unknown = false;
    for (const b of bases) {
      const r = this.hasMember(b, member, depth + 1);
      if (r === true) return true;
      if (r === 'unknown') unknown = true;
    }
    return unknown ? 'unknown' : false;
  }

  private basesOf(cls: SymbolFact, f: FileFacts, body: string): SymbolFact[] | 'unknown' {
    let names: string[];
    if (isPy(f)) {
      const m = /^\s*class\s+\w+\s*(?:\(([^)]*)\))?\s*:/.exec(body);
      if (!m) return 'unknown';
      names = (m[1] ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== 'object');
      if (names.some((n) => n.includes('=') || n.startsWith('*'))) return 'unknown';
    } else {
      const head = body.slice(0, body.indexOf('{') >>> 0);
      const m = /\bextends\s+([\w$.]+)\s*(<[^{]*?>)?\s*(implements\b|$)/.exec(head);
      if (/\bextends\b/.test(head) && !m) return 'unknown';
      names = m ? [m[1]!] : [];
    }
    const out: SymbolFact[] = [];
    for (const n of names) {
      if (n.includes('.') || n.includes('[') || n.includes('(')) return 'unknown';
      const b = this.bind(cls.fileId, n);
      if (b === 'unknown' || !b.sym || (b.sym.kind !== 'class' && b.sym.kind !== 'dataclass')) return 'unknown';
      out.push(b.sym);
    }
    return out;
  }

  private memberPool(cls: SymbolFact, depth = 0): SymbolFact[] {
    if (depth > 4) return [];
    const f = this.file(cls.fileId);
    const body = this.symText(cls);
    const bases = f ? this.basesOf(cls, f, body) : 'unknown';
    return [...this.membersOf(cls.id), ...(bases === 'unknown' ? [] : bases.flatMap((b) => this.memberPool(b, depth + 1)))];
  }

  verify(rel: string, opts: VerifyOptions = {}): VerifyResult {
    const f = fileFacts(this.db, rel);
    const res: VerifyResult = { file: rel, unchecked: null, findings: [] };
    if (!f) return { ...res, unchecked: 'not indexed' };
    if (f.status !== 'ok') return { ...res, unchecked: f.status === 'partial' ? 'parse errors' : `index status ${f.status}` };
    if (f.isGenerated) return { ...res, unchecked: 'generated file' };
    if (!isTs(f) && !isPy(f) && f.language !== 'javascript' && f.language !== 'jsx') return { ...res, unchecked: 'unsupported language' };
    const exclude = opts.config?.grounding.exclude ?? [];
    if (exclude.length && picomatch(exclude, { dot: true })(rel)) return { ...res, unchecked: 'excluded' };
    if (f.path.endsWith('.d.ts') || f.path.endsWith('.pyi')) return { ...res, unchecked: 'declaration file' };
    const text = this.text(rel);
    if (text === null) return { ...res, unchecked: 'unreadable' };
    const lines = text.split('\n');
    for (const imp of this.importsOf(f.id)) {
      if (!inRanges(imp.line, opts.ranges, importEnd(lines, imp.line))) continue;
      const finding = this.checkImport(f, imp, lines);
      if (finding) res.findings.push(finding);
    }
    for (const call of callFacts(this.db, f.id)) {
      if (!inRanges(call.line, opts.ranges)) continue;
      if (suppressed(lines, call.line)) continue;
      const finding = this.checkCall(f, call, text);
      if (finding) res.findings.push({ ...finding, column: call.column });
    }
    res.findings.sort((a, b) => a.line - b.line);
    return res;
  }

  private checkImport(f: FileFacts, imp: ImportFact, lines: string[]): Finding | null {
    if (imp.unresolvedReason === 'not-found') {
      if (isPy(f) && optionalPythonImport(lines, imp.line)) return null;
      if (!imp.module.startsWith('.') || existsOnDisk(this.root, f.path, imp.module, isPy(f))) return null;
      return {
        file: f.path,
        line: imp.line,
        kind: 'missing-module',
        name: imp.module,
        message: `module '${imp.module}' does not exist.`,
        blocking: true,
        suggestions: [],
      };
    }
    if (!this.trusted(f, imp) || suppressed(lines, imp.line)) return null;
    if (imp.resolvedFileId === null || imp.kind === 'side-effect' || imp.kind === 'namespace' || imp.kind === 'module' || imp.kind === 'reexport-all') return null;
    if (imp.name === '*' || this.isPyModuleItself(imp)) return null;
    const wanted = imp.kind === 'default' ? 'default' : imp.name;
    if (this.exportOf(imp.resolvedFileId, wanted) !== null) return null;
    const target = this.file(imp.resolvedFileId)!;
    const near = this.top(target.id).filter((s) => s.exported || isPy(target));
    const suggestions = wanted === 'default' ? [] : suggest(wanted, { near, pool: this.suggestionPool() });
    return {
      file: f.path,
      line: imp.line,
      kind: 'unknown-export',
      name: wanted,
      message: `${wanted === 'default' ? 'no default export' : `'${wanted}' is not exported`} in ${target.path}.${renderSuggestions(suggestions)}`,
      blocking: true,
      suggestions,
    };
  }

  private checkCall(f: FileFacts, call: CallFact, text: string): Finding | null {
    if (call.calleeId && (call.confidence === 'exact' || call.confidence === 'import-resolved')) {
      const head = call.calleeText.split('.')[0]!;
      // `super.m()` may resolve to the subclass override: the base signature is not known for sure.
      if (head === 'super' || /^super\(\)/.test(call.calleeText)) return null;
      if (!/^(this|self|cls)$/.test(head)) {
        if (this.bindings(text, head) > 1 || this.maybeShadowed(f, call, head, text)) return null;
        if (this.bind(f.id, head) === 'unknown') return null;
      }
      return this.checkArgs(f, call);
    }
    if (call.calleeId || f.isTest) return null;
    const parts = call.calleeText.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1] || /[^\w$]/.test(parts[0] + parts[1])) return null;
    const [head, member] = parts as [string, string];
    if (DYNAMIC_TEXT.test(text) || /\bjest\.mock|\bvi\.mock|\bmock\.patch|\bMagicMock\b/.test(text)) return null;
    let cls: SymbolFact | null = null;
    let moduleFileId: number | undefined;
    if (head === 'this' || head === 'self' || head === 'cls') {
      cls = this.enclosingClass(f, call.callerId);
    } else {
      if (this.maybeShadowed(f, call, head, text)) return null;
      const b = this.bind(f.id, head);
      if (b === 'unknown') return null;
      if (b.moduleFileId !== undefined) moduleFileId = b.moduleFileId;
      else if (b.sym && (b.sym.kind === 'class' || b.sym.kind === 'dataclass')) cls = b.sym;
    }
    if (moduleFileId !== undefined) {
      if (this.exportOf(moduleFileId, member) !== null) return null;
      const target = this.file(moduleFileId)!;
      const suggestions = suggest(member, { near: this.top(moduleFileId).filter((s) => s.exported || isPy(target)), pool: this.suggestionPool() });
      return { file: f.path, line: call.line, kind: 'unknown-member', name: call.calleeText, message: `'${member}' is not defined in ${target.path}.${renderSuggestions(suggestions)}`, blocking: false, suggestions };
    }
    if (!cls || this.hasMember(cls, member) !== false) return null;
    const suggestions = suggest(member, { near: this.memberPool(cls), limit: 3 });
    return {
      file: f.path,
      line: call.line,
      kind: 'unknown-member',
      name: call.calleeText,
      message: `class ${cls.name} (${cls.file}:${cls.line}) has no member '${member}'.${renderSuggestions(suggestions)}`,
      blocking: false,
      suggestions,
    };
  }

  private enclosingClass(f: FileFacts, callerId: string | null): SymbolFact | null {
    let cur = callerId ? symbolFact(this.db, callerId) : null;
    if (!cur) return null;
    // In JS/TS a nested non-arrow function rebinds `this`: only trust a call made directly in a method.
    if (!isPy(f)) {
      if (cur.kind !== 'method' || !cur.parentId) return null;
      const p = symbolFact(this.db, cur.parentId);
      return p && p.kind === 'class' ? p : null;
    }
    while (cur && cur.kind !== 'class' && cur.kind !== 'dataclass') cur = cur.parentId ? symbolFact(this.db, cur.parentId) : null;
    return cur;
  }

  /** A local variable, parameter or loop target with the same name as the import may shadow it. */
  private maybeShadowed(f: FileFacts, call: CallFact, head: string, text: string): boolean {
    const re = new RegExp(`(?<![.\\w$])${escapeRe(head)}\\b(?!\\s*[.(])`);
    void f;
    let scope = call.callerId ? symbolFact(this.db, call.callerId) : null;
    if (!scope) return re.test(text.split('\n').filter((l) => !/^\s*(import|from)\b/.test(l)).join('\n'));
    // Parameters and locals of every enclosing function can shadow the import, not just the innermost one.
    for (let depth = 0; scope && depth < 16; depth++) {
      if (re.test(this.symText(scope))) return true;
      scope = scope.parentId ? symbolFact(this.db, scope.parentId) : null;
    }
    return false;
  }

  private checkArgs(f: FileFacts, call: CallFact): Finding | null {
    if (call.hasSpread) return null;
    const target = symbolFact(this.db, call.calleeId!);
    if (!target || !CALLABLE.has(target.kind)) return null;
    const tf = this.file(target.fileId);
    if (!tf || tf.status !== 'ok') return null;
    const sameFamily = (isTs(f) && isTs(tf)) || (isPy(f) && isPy(tf));
    if (!sameFamily || tf.path.endsWith('.d.ts')) return null;
    const body = this.symText(target);
    if (this.patched(target, f) || this.patched(target, tf)) return null;
    if (isPy(tf)) {
      const dataclassOk = (d: string) => target.kind === 'dataclass' && /^(dataclasses\.)?dataclass$/.test(d);
      if (target.decorators.some((d) => !SAFE_PY_DECORATORS.has(d.replace(/\(.*$/s, '')) && !dataclassOk(d))) return null;
      if (target.kind === 'class' || target.kind === 'dataclass') {
        if (/\bmetaclass\s*=|__new__|__call__/.test(body)) return null;
        // Without its own __init__ the signature comes from a base (often outside the repo): unknown.
        const init = this.membersOf(target.id).find((m) => m.name === '__init__');
        if (target.kind === 'class' && !init) return null;
        if (init?.decorators.some((d) => !SAFE_PY_DECORATORS.has(d.replace(/\(.*$/s, '')))) return null;
        if (target.kind === 'dataclass' && /\bClassVar\b/.test(body)) return null;
        if (target.kind === 'dataclass' && (/^\s*class\s+\w+\s*\(/.test(body) || /kw_only|KW_ONLY|init\s*=\s*False/.test(body + target.decorators.join(' ')))) return null;
      }
      if (target.kind === 'method' && call.calleeText.includes('.') && !/^(self|cls)\./.test(call.calleeText)) {
        // `Cls.method(obj, ...)` passes self explicitly; only static/class methods are safe to count.
        if (!target.decorators.some((d) => d === 'staticmethod' || d === 'classmethod')) return null;
      }
      return this.checkPyArgs(f, call, target);
    }
    if (target.decorators.length || /\barguments\b/.test(body)) return null;
    if (target.kind === 'class' && /\bextends\b/.test(body.slice(0, body.indexOf('{') >>> 0)) && !this.membersOf(target.id).some((m) => m.name === 'constructor')) return null;
    const max = target.maxArity;
    if (call.argCount >= target.minArity && (max === null || call.argCount <= max)) return null;
    return this.arityFinding(f, call, target, `takes ${arityText(target.minArity, max)} argument${max === 1 ? '' : 's'}, got ${call.argCount}`);
  }

  /** `Cls.m = ...`, `setattr(...)` or other dynamic rewiring of the target in `where` makes its signature unknown. */
  private patched(target: SymbolFact, where: FileFacts): boolean {
    const text = this.text(where.path) ?? '';
    // Object.assign onto an instance/class, or defineProperty with a computed key, may replace any member.
    if (/\bsetattr\s*\(|Object\.assign\s*\(\s*(this|self|[A-Z][\w$]*(\.prototype)?)\s*,|defineProperty\s*\([^,]*,\s*(?![\s'"]|`(?:[^`$]|\$(?!\{))*`)/.test(text)) return true;
    const n = escapeRe(target.name);
    return new RegExp(`\\.${n}\\s*=(?!=)|defineProperty\\s*\\([^)]*['"\`]${n}['"\`]`).test(text);
  }

  private checkPyArgs(f: FileFacts, call: CallFact, target: SymbolFact): Finding | null {
    const params = target.params;
    const positional = params.filter((p) => !p.keywordOnly && !p.rest && !p.kwrest);
    const hasRest = params.some((p) => p.rest);
    const hasKwrest = params.some((p) => p.kwrest);
    if (!hasRest && call.argCount > positional.length)
      return this.arityFinding(f, call, target, `takes at most ${positional.length} positional argument${positional.length === 1 ? '' : 's'}, got ${call.argCount}`);
    if (!hasKwrest) {
      for (const kw of call.keywordArgs) {
        if (params.some((p) => p.name === kw && !p.positionalOnly && !p.rest)) continue;
        const near = params.filter((p) => !p.rest && !p.kwrest && !p.positionalOnly).map((p) => p.name);
        const best = near.map((n) => ({ n, s: similarity(kw, n) })).sort((a, b) => b.s - a.s)[0];
        return {
          file: f.path,
          line: call.line,
          kind: 'unknown-keyword',
          name: kw,
          message: `${target.qualifiedName}() got an unexpected keyword '${kw}' — ${target.signature} (${target.file}:${target.line}).${best && best.s >= 0.5 ? ` Did you mean ${best.n}=?` : ''}`,
          blocking: false,
          suggestions: [],
        };
      }
    }
    const missing: string[] = [];
    positional.forEach((p, i) => {
      if (!p.optional && i >= call.argCount && !call.keywordArgs.includes(p.name)) missing.push(p.name);
    });
    for (const p of params) if (p.keywordOnly && !p.optional && !p.rest && !p.kwrest && !call.keywordArgs.includes(p.name)) missing.push(p.name);
    if (!missing.length) return null;
    return this.arityFinding(f, call, target, `is missing required argument${missing.length > 1 ? 's' : ''} ${missing.map((m) => `'${m}'`).join(', ')}`);
  }

  private arityFinding(f: FileFacts, call: CallFact, target: SymbolFact, what: string): Finding {
    return {
      file: f.path,
      line: call.line,
      kind: 'arity',
      name: call.calleeText,
      message: `${call.calleeText}() ${what} — ${target.signature} (${target.file}:${target.line}).`,
      blocking: true,
      suggestions: [],
    };
  }
}

/** `// @ts-expect-error`, `// @ts-ignore`, `# type: ignore`, `# noqa`, `# gw: ignore` on the line or the one above. */
function suppressed(lines: string[], line: number): boolean {
  const here = lines[line - 1] ?? '';
  const above = lines[line - 2] ?? '';
  return /#\s*(type:\s*ignore|noqa|pyright:\s*ignore|gw:\s*ignore)|\/\/\s*gw:\s*ignore/.test(here) || /@ts-(expect-error|ignore)|gw:\s*ignore/.test(above);
}

function similarity(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.includes(y) || y.includes(x)) return 0.8;
  let same = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] === y[i]) same++;
  return same / Math.max(x.length, y.length);
}

function arityText(min: number, max: number | null): string {
  if (max === null) return `at least ${min}`;
  return min === max ? `${min}` : `${min}-${max}`;
}

/** Last line of a (possibly multi-line) import statement starting at `line`. */
function importEnd(lines: string[], line: number): number {
  for (let i = line - 1; i < Math.min(lines.length, line + 60); i++) {
    const l = lines[i]!;
    if (/\bfrom\s+['"]|\brequire\s*\(|^\s*import\s+['"]|;\s*$/.test(l) || (i === line - 1 && !/[({]\s*(#.*)?$/.test(l)) || (i > line - 1 && /\)\s*(#.*)?$/.test(l)))
      return i + 1;
  }
  return line;
}

/** A relative import whose target the index does not know may still be a CSS/JSON/asset file or an ignored path. */
function existsOnDisk(root: string, fromFile: string, spec: string, py: boolean): boolean {
  const baseDir = path.join(root, path.dirname(fromFile));
  let target: string;
  if (py) {
    const dots = /^\.+/.exec(spec)![0].length;
    target = path.join(baseDir, ...Array<string>(dots - 1).fill('..'), ...spec.slice(dots).split('.').filter(Boolean));
  } else target = path.join(baseDir, spec);
  if (existsSync(target)) return true;
  // Missing ignored paths can be build products that do not exist in a source checkout.
  const rel = path.relative(root, target).split(path.sep).join('/');
  if (rel && !rel.startsWith('../')) {
    const parts = rel.split('/');
    for (let i = 0; i < parts.length; i++) {
      const rules = path.join(root, ...parts.slice(0, i), '.gitignore');
      if (!existsSync(rules)) continue;
      if (ignore().add(readFileSync(rules, 'utf8')).ignores(parts.slice(i).join('/'))) return true;
    }
  }
  const dir = path.dirname(target);
  const base = path.basename(target).replace(/\.(m?js|cjs|jsx)$/, '');
  try {
    return readdirSync(dir).some((e) => e === base || e.startsWith(`${base}.`));
  } catch {
    return false;
  }
}

function optionalPythonImport(lines: string[], line: number): boolean {
  const indent = (s: string) => /^\s*/.exec(s)![0].length;
  const level = indent(lines[line - 1] ?? '');
  for (let i = line - 2; i >= 0; i--) {
    const text = lines[i]!;
    if (!text.trim() || indent(text) >= level) continue;
    if (!/^\s*try\s*:/.test(text)) continue;
    const depth = indent(text);
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next.trim() || indent(next) > depth) continue;
      if (j < line - 1 || indent(next) < depth || !/^\s*except\b/.test(next)) break;
      if (/\b(ImportError|ModuleNotFoundError)\b/.test(next)) return true;
    }
  }
  return false;
}

export function verifyFile(db: Db, root: string, rel: string, opts: VerifyOptions = {}): VerifyResult {
  return new Grounder(db, root).verify(rel, opts);
}

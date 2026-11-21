import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Turns an import specifier into a repo file. Pure over the set of indexed paths so it is cheap to rerun.

export interface FileInfo {
  id: number;
  path: string;
  language: string | null;
}

export interface Resolution {
  fileId: number | null;
  reason: string | null; // 'external' | 'not-found' | null
}

interface TsPaths {
  baseUrl: string | null; // repo-relative
  paths: [string, string[]][];
}

function readJsonc(file: string): unknown {
  try {
    const raw = readFileSync(file, 'utf8')
      .replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (_m, str: string | undefined) => str ?? '')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadTsPaths(root: string): TsPaths {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const f = path.join(root, name);
    if (!existsSync(f)) continue;
    const j = readJsonc(f) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | null;
    const co = j?.compilerOptions;
    if (!co) continue;
    const baseUrl = co.baseUrl !== undefined ? path.posix.normalize(co.baseUrl).replace(/^\.\/?$/, '').replace(/^\.\//, '') : null;
    return { baseUrl, paths: Object.entries(co.paths ?? {}) };
  }
  return { baseUrl: null, paths: [] };
}

const TS_EXTS = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

export class ImportResolver {
  private readonly byPath = new Map<string, FileInfo>();
  private readonly pySuffix = new Map<string, string[]>();
  private readonly topDirs = new Set<string>();
  private readonly tsPaths: TsPaths;

  constructor(root: string, files: FileInfo[]) {
    this.tsPaths = loadTsPaths(root);
    for (const f of files) {
      this.byPath.set(f.path, f);
      this.topDirs.add(f.path.split('/')[0]!.replace(/\.py$/, ''));
      if (f.language === 'python') {
        const segs = f.path.split('/');
        for (let i = 0; i < segs.length; i++) {
          const suf = segs.slice(i).join('/');
          const list = this.pySuffix.get(suf);
          if (list) list.push(f.path);
          else this.pySuffix.set(suf, [f.path]);
        }
      }
    }
  }

  private file(p: string): FileInfo | undefined {
    return this.byPath.get(p);
  }

  private tryTs(base: string): FileInfo | undefined {
    const b = path.posix.normalize(base).replace(/^\.\//, '');
    const hit = this.file(b);
    if (hit) return hit;
    const stripped = b.replace(/\.(m|c)?jsx?$/, '');
    for (const stem of stripped !== b ? [stripped, b] : [b]) {
      for (const e of TS_EXTS) {
        const f = this.file(stem + e);
        if (f) return f;
      }
    }
    for (const e of TS_EXTS) {
      const f = this.file(`${b}/index${e}`);
      if (f) return f;
    }
    return undefined;
  }

  resolveTs(fromPath: string, spec: string): Resolution {
    if (spec.startsWith('.')) {
      const f = this.tryTs(path.posix.join(path.posix.dirname(fromPath), spec));
      return f ? { fileId: f.id, reason: null } : { fileId: null, reason: 'not-found' };
    }
    if (spec.startsWith('/')) {
      const f = this.tryTs(spec.slice(1));
      return f ? { fileId: f.id, reason: null } : { fileId: null, reason: 'not-found' };
    }
    const base = this.tsPaths.baseUrl ?? '';
    let aliased = false;
    for (const [pattern, targets] of this.tsPaths.paths) {
      const star = pattern.indexOf('*');
      let rest: string | null = null;
      if (star < 0) rest = pattern === spec ? '' : null;
      else if (spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1)))
        rest = spec.slice(star, spec.length - (pattern.length - star - 1));
      if (rest === null) continue;
      aliased = true;
      for (const t of targets) {
        const f = this.tryTs(path.posix.join(base, t.replace('*', rest)));
        if (f) return { fileId: f.id, reason: null };
      }
    }
    if (this.tsPaths.baseUrl !== null) {
      const f = this.tryTs(path.posix.join(base, spec));
      if (f) return { fileId: f.id, reason: null };
    }
    return { fileId: null, reason: aliased ? 'not-found' : 'external' };
  }

  private pyCandidates(rel: string): string[] {
    return rel ? [`${rel}.py`, `${rel}.pyi`, `${rel}/__init__.py`] : ['__init__.py'];
  }

  /** Resolve a Python module path; `name` lets `from pkg import mod` land on pkg/mod.py. */
  resolvePy(fromPath: string, module: string, name: string | null): Resolution {
    const dots = /^\.*/.exec(module)![0].length;
    const rest = module.slice(dots).split('.').filter(Boolean).join('/');
    if (dots > 0) {
      let dir = path.posix.dirname(fromPath);
      for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir);
      const join = (r: string) => (dir === '.' ? r : r ? `${dir}/${r}` : dir);
      if (name && name !== '*') {
        const sub = rest ? `${rest}/${name}` : name;
        for (const c of [`${join(sub)}.py`, `${join(sub)}/__init__.py`]) {
          const f = this.file(c);
          if (f && !this.file(rest ? `${join(rest)}.py` : '')) return { fileId: f.id, reason: null };
        }
      }
      const cands = rest ? this.pyCandidates(join(rest)) : [dir === '.' ? '__init__.py' : `${dir}/__init__.py`];
      for (const c of cands) {
        const f = this.file(c);
        if (f) return { fileId: f.id, reason: null };
      }
      return { fileId: null, reason: 'not-found' };
    }
    const pick = (suffix: string): FileInfo | undefined => {
      const list = this.pySuffix.get(suffix);
      if (!list?.length) return undefined;
      const best = [...list].sort((a, b) => a.length - b.length || a.localeCompare(b))[0]!;
      return this.file(best);
    };
    if (name && name !== '*') {
      const f = pick(`${rest}/${name}.py`) ?? pick(`${rest}/${name}/__init__.py`);
      const mod = pick(`${rest}.py`);
      if (f && !mod) return { fileId: f.id, reason: null };
    }
    for (const c of this.pyCandidates(rest)) {
      const f = pick(c);
      if (f) return { fileId: f.id, reason: null };
    }
    const first = rest.split('/')[0]!;
    return { fileId: null, reason: this.topDirs.has(first) ? 'not-found' : 'external' };
  }
}

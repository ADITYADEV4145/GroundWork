import type { Db, Row } from '../store/db.js';
import type { CallConfidence } from '../types.js';
import { ImportResolver, type FileInfo } from './imports.js';

// Second pass over the whole index: import specifiers -> files, call sites -> symbols. Only rows whose
// answer changed are written, so a refresh with a few edits stays cheap.

interface Sym {
  id: string;
  fileId: number;
  name: string;
  kind: string;
  parentId: string | null;
  exported: boolean;
  isDefault: boolean;
}

interface Imp {
  id: number;
  fileId: number;
  module: string;
  name: string;
  alias: string | null;
  kind: string;
  resolvedFileId: number | null;
  reason: string | null;
}

const CALLABLE = new Set(['function', 'method', 'class', 'component', 'dataclass']);
const CLASSY = new Set(['class', 'dataclass']);

export interface LinkStats {
  imports: number;
  importsResolved: number;
  importsExternal: number;
  calls: number;
  callsResolved: number;
  ms: number;
}

export function linkIndex(db: Db, root: string): LinkStats {
  const t0 = performance.now();
  const files = db.prepare('SELECT id, path, language FROM files').all() as unknown as FileInfo[];
  const fileById = new Map(files.map((f) => [f.id, f]));
  const resolver = new ImportResolver(root, files);

  // --- imports
  const imports: Imp[] = db
    .prepare('SELECT id, file_id, module, name, alias, kind, resolved_file_id, unresolved_reason FROM imports')
    .all()
    .map((r: Row) => ({
      id: Number(r.id),
      fileId: Number(r.file_id),
      module: String(r.module),
      name: String(r.name),
      alias: r.alias === null ? null : String(r.alias),
      kind: String(r.kind),
      resolvedFileId: r.resolved_file_id === null ? null : Number(r.resolved_file_id),
      reason: r.unresolved_reason === null ? null : String(r.unresolved_reason),
    }))
    .map((im) => {
      const from = fileById.get(im.fileId)!;
      const res = from.language === 'python' ? resolver.resolvePy(from.path, im.module, im.kind === 'named' ? im.name : null) : resolver.resolveTs(from.path, im.module);
      if (res.fileId !== im.resolvedFileId || res.reason !== im.reason)
        db.prepare('UPDATE imports SET resolved_file_id = ?, unresolved_reason = ? WHERE id = ?').run(res.fileId, res.reason, im.id);
      return { ...im, resolvedFileId: res.fileId, reason: res.reason };
    });
  const external = imports.filter((i) => i.resolvedFileId === null && i.reason === 'external').length;

  // --- symbol tables
  const syms: Sym[] = db
    .prepare('SELECT id, file_id, name, kind, parent_id, exported, is_default_export FROM symbols')
    .all()
    .map((r) => ({
      id: String(r.id),
      fileId: Number(r.file_id),
      name: String(r.name),
      kind: String(r.kind),
      parentId: r.parent_id === null ? null : String(r.parent_id),
      exported: Number(r.exported) === 1,
      isDefault: Number(r.is_default_export) === 1,
    }));
  const symById = new Map(syms.map((s) => [s.id, s]));
  const topByFile = new Map<number, Map<string, Sym>>();
  const defaultByFile = new Map<number, Sym>();
  const members = new Map<string, Map<string, Sym>>();
  const globalByName = new Map<string, Sym[]>();
  for (const s of syms) {
    if (s.parentId === null) {
      let m = topByFile.get(s.fileId);
      if (!m) topByFile.set(s.fileId, (m = new Map()));
      if (!m.has(s.name)) m.set(s.name, s);
      if (s.isDefault) defaultByFile.set(s.fileId, s);
    } else {
      let m = members.get(s.parentId);
      if (!m) members.set(s.parentId, (m = new Map()));
      if (!m.has(s.name)) m.set(s.name, s);
    }
    if (CALLABLE.has(s.kind)) {
      const l = globalByName.get(s.name);
      if (l) l.push(s);
      else globalByName.set(s.name, [s]);
    }
  }
  const importsByFile = new Map<number, Imp[]>();
  for (const im of imports) {
    const l = importsByFile.get(im.fileId);
    if (l) l.push(im);
    else importsByFile.set(im.fileId, [im]);
  }

  const aliasByFile = new Map<number, Map<string, string>>();
  for (const r of db.prepare('SELECT file_id, local_name, exported_name FROM export_aliases').all()) {
    const fid = Number(r.file_id);
    let m = aliasByFile.get(fid);
    if (!m) aliasByFile.set(fid, (m = new Map()));
    m.set(String(r.exported_name), String(r.local_name));
  }

  /** Follow re-exports (and Python package __init__ imports) to the defining symbol. */
  const exportOf = (fileId: number, name: string, depth = 0): Sym | null => {
    if (depth > 5) return null;
    const aliased = aliasByFile.get(fileId)?.get(name);
    if (aliased !== undefined) {
      const local = topByFile.get(fileId)?.get(aliased);
      if (local) return local;
      // export { imported as renamed }
      for (const im of importsByFile.get(fileId) ?? [])
        if (im.resolvedFileId !== null && (im.alias ?? im.name) === aliased && im.kind !== 'namespace' && im.kind !== 'module') {
          const hit = exportOf(im.resolvedFileId, im.kind === 'default' ? 'default' : im.name, depth + 1);
          if (hit) return hit;
        }
    }
    if (name === 'default') {
      const d = defaultByFile.get(fileId);
      if (d) return d;
    }
    const top = topByFile.get(fileId)?.get(name);
    if (top && (top.exported || fileById.get(fileId)?.language === 'python')) return top;
    for (const im of importsByFile.get(fileId) ?? []) {
      if (im.resolvedFileId === null) continue;
      const local = im.alias ?? im.name;
      if ((im.kind === 'reexport' || im.kind === 'named') && local === name) {
        const lang = fileById.get(fileId)?.language;
        if (im.kind === 'named' && lang !== 'python') continue;
        const hit = exportOf(im.resolvedFileId, im.name, depth + 1);
        if (hit) return hit;
      }
      if (im.kind === 'reexport-all' && im.alias === null) {
        const hit = exportOf(im.resolvedFileId, name, depth + 1);
        if (hit) return hit;
      }
    }
    return top ?? null;
  };

  const enclosingClass = (id: string | null): Sym | null => {
    let cur = id ? symById.get(id) : undefined;
    while (cur) {
      if (CLASSY.has(cur.kind)) return cur;
      cur = cur.parentId ? symById.get(cur.parentId) : undefined;
    }
    return null;
  };

  /** What a bare local name refers to in a file: a local top-level symbol, an imported symbol, or an imported module. */
  const bind = (fileId: number, name: string): { sym?: Sym; moduleFile?: number; conf: CallConfidence } | null => {
    const local = topByFile.get(fileId)?.get(name);
    if (local) return { sym: local, conf: 'exact' };
    for (const im of importsByFile.get(fileId) ?? []) {
      if (im.kind === 'module' && im.alias === null && im.module.includes('.')) continue;
      const localName = im.alias ?? (im.kind === 'module' ? im.module : im.name);
      if (localName !== name || im.resolvedFileId === null) continue;
      if (im.kind === 'namespace' || im.kind === 'module') return { moduleFile: im.resolvedFileId, conf: 'import-resolved' };
      if (im.kind === 'default') {
        const d = exportOf(im.resolvedFileId, 'default');
        if (d) return { sym: d, conf: 'import-resolved' };
        continue;
      }
      const hit = exportOf(im.resolvedFileId, im.name);
      if (hit) return { sym: hit, conf: 'import-resolved' };
      // `from pkg import mod` where mod is a file
      const f = fileById.get(im.resolvedFileId);
      if (f && f.language === 'python' && /(^|\/)([^/]+)(\.py|\/__init__\.py)$/.exec(f.path)?.[2] === im.name)
        return { moduleFile: im.resolvedFileId, conf: 'import-resolved' };
    }
    return null;
  };

  const boundExternally = (fileId: number, head: string): boolean =>
    (importsByFile.get(fileId) ?? []).some(
      (im) => im.resolvedFileId === null && (im.alias ?? (im.kind === 'module' ? im.module.split('.')[0]! : im.name)) === head,
    );

  const resolveCall = (fileId: number, callerId: string | null, text: string, name: string): { id: string; conf: CallConfidence } | null => {
    const parts = text.replace(/\?\./g, '.').split('.');
    if (parts.length === 1) {
      const b = bind(fileId, name);
      if (b?.sym) return { id: b.sym.id, conf: b.conf };
    } else {
      const head = parts[0]!;
      if (parts.length === 2 && (head === 'this' || head === 'self' || head === 'cls' || head === 'super')) {
        const cls = enclosingClass(callerId);
        const m = cls ? members.get(cls.id)?.get(name) : undefined;
        if (m) return { id: m.id, conf: 'exact' };
      } else {
        // walk a.b.c through module bindings
        let b = bind(fileId, head);
        let i = 1;
        // python `import a.b` binds `a`; let `a.b.f` land in a/b.py
        if (!b) {
          for (const im of importsByFile.get(fileId) ?? []) {
            if (im.kind !== 'module' || im.alias !== null || im.resolvedFileId === null) continue;
            const segs = im.module.split('.');
            if (segs.length < parts.length && segs.every((s, k) => parts[k] === s)) {
              b = { moduleFile: im.resolvedFileId, conf: 'import-resolved' };
              i = segs.length;
              break;
            }
          }
        }
        while (b && i < parts.length) {
          const seg = parts[i]!;
          if (b.moduleFile !== undefined) {
            const s = exportOf(b.moduleFile, seg);
            b = s ? { sym: s, conf: b.conf } : null;
          } else if (b.sym && CLASSY.has(b.sym.kind)) {
            const m = members.get(b.sym.id)?.get(seg);
            b = m ? { sym: m, conf: b.conf } : null;
          } else b = null;
          i++;
        }
        if (b?.sym && b.sym.name === name) return { id: b.sym.id, conf: b.conf };
      }
    }
    if (parts.length > 1 && boundExternally(fileId, parts[0]!)) return null;
    const py = fileById.get(fileId)?.language === 'python';
    const cands = globalByName.get(name)?.filter((s) => (fileById.get(s.fileId)?.language === 'python') === py);
    if (cands && cands.length === 1) return { id: cands[0]!.id, conf: 'name-only' };
    return null;
  };

  const calls = db.prepare('SELECT id, file_id, caller_id, callee_text, callee_name, callee_id, confidence FROM calls').all();
  const upd = db.prepare('UPDATE calls SET callee_id = ?, confidence = ? WHERE id = ?');
  let resolved = 0;
  for (const c of calls) {
    const r = resolveCall(Number(c.file_id), c.caller_id === null ? null : String(c.caller_id), String(c.callee_text), String(c.callee_name));
    const id = r?.id ?? null;
    const conf = r?.conf ?? null;
    if (id) resolved++;
    if (id !== c.callee_id || conf !== c.confidence) upd.run(id, conf, Number(c.id));
  }
  return {
    imports: imports.length,
    importsResolved: imports.filter((i) => i.resolvedFileId !== null).length,
    importsExternal: external,
    calls: calls.length,
    callsResolved: resolved,
    ms: Math.round(performance.now() - t0),
  };
}

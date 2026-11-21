import picomatch from 'picomatch';
import type { Db, Row } from '../store/db.js';
import { splitWords } from '../extract/fingerprint.js';
import type { Param, SymbolKind } from '../types.js';

// Read-side API over the index. Every later phase (MCP tools, hooks, gates) should go through here.

export interface SymbolHit {
  id: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  file: string;
  line: number;
  endLine: number;
  signature: string;
  exported: boolean;
  isTest: boolean;
  score: number;
}

export interface SearchOptions {
  kinds?: SymbolKind[];
  limit?: number;
  pathGlob?: string;
  includeTests?: boolean;
}

const HIT_COLS = `s.id, s.name, s.qualified_name, s.kind, s.start_line, s.end_line, s.signature, s.exported, f.path, f.is_test`;

function toHit(r: Row, score = 0): SymbolHit {
  return {
    id: String(r.id),
    name: String(r.name),
    qualifiedName: String(r.qualified_name),
    kind: String(r.kind) as SymbolKind,
    file: String(r.path),
    line: Number(r.start_line),
    endLine: Number(r.end_line),
    signature: String(r.signature),
    exported: Number(r.exported) === 1,
    isTest: Number(r.is_test) === 1,
    score,
  };
}

function ftsQuery(words: string[]): string {
  return words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' OR ');
}

/** Ranked symbol search: exact and prefix name matches first, then word overlap over names, docs and paths. */
export function searchSymbols(db: Db, query: string, opts: SearchOptions = {}): SymbolHit[] {
  const q = query.trim();
  if (!q) return [];
  const limit = opts.limit ?? 20;
  const words = [...new Set(splitWords(q))];
  const rows = new Map<string, Row>();
  const add = (rs: Row[]) => rs.forEach((r) => rows.set(String(r.id), r));
  add(db.prepare(`SELECT ${HIT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name = ? OR s.qualified_name = ? LIMIT 200`).all(q, q));
  add(db.prepare(`SELECT ${HIT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name LIKE ? ESCAPE '\\' LIMIT 200`).all(`${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  if (words.length) {
    try {
      add(
        db
          .prepare(`SELECT ${HIT_COLS} FROM symbols_fts x JOIN symbols s ON s.rowid = x.rowid JOIN files f ON f.id = s.file_id WHERE symbols_fts MATCH ? LIMIT 500`)
          .all(ftsQuery(words)),
      );
    } catch {
      // malformed FTS query: fall back to name matches only
    }
  }
  const ql = q.toLowerCase();
  const glob = opts.pathGlob ? picomatch(opts.pathGlob, { dot: true }) : null;
  const hits: SymbolHit[] = [];
  for (const r of rows.values()) {
    const h = toHit(r);
    if (opts.kinds && !opts.kinds.includes(h.kind)) continue;
    if (glob && !glob(h.file)) continue;
    if (h.isTest && opts.includeTests === false) continue;
    const name = h.name.toLowerCase();
    let score = 0;
    if (name === ql || h.qualifiedName.toLowerCase() === ql) score += 100;
    else if (name.startsWith(ql)) score += 60;
    else if (h.qualifiedName.toLowerCase().includes(ql)) score += 40;
    const nameWords = new Set(splitWords(h.qualifiedName));
    const pathWords = new Set(splitWords(h.file));
    if (words.length) {
      const inName = words.filter((w) => [...nameWords].some((n) => n.startsWith(w))).length;
      const inPath = words.filter((w) => pathWords.has(w)).length;
      score += (30 * inName) / words.length + (8 * inPath) / words.length;
    }
    if (h.exported) score += 3;
    if (h.isTest) score -= 10;
    if (h.kind === 'variable') score -= 2;
    h.score = Math.round(score * 10) / 10;
    if (h.score > 0) hits.push(h);
  }
  hits.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
  return hits.slice(0, limit);
}

export interface SymbolDetail extends SymbolHit {
  params: Param[];
  returnType: string | null;
  minArity: number;
  maxArity: number | null;
  docstring: string | null;
  decorators: string[];
  isAsync: boolean;
  isDefaultExport: boolean;
  parent: string | null;
  members: { name: string; kind: SymbolKind; line: number }[];
  callers: { file: string; line: number; caller: string | null; confidence: string | null }[];
  callersTotal: number;
  callees: { name: string; line: number; target: string | null; confidence: string | null }[];
}

/**
 * Look a symbol up by id, `file:name`, qualified name or plain name. Returns every match when the
 * reference is ambiguous so the caller can list them.
 */
export function findSymbols(db: Db, ref: string): SymbolHit[] {
  const byId = db.prepare(`SELECT ${HIT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.id = ?`).all(ref);
  if (byId.length) return byId.map((r) => toHit(r));
  const colon = ref.lastIndexOf(':');
  if (colon > 0) {
    const file = ref.slice(0, colon);
    const name = ref.slice(colon + 1);
    const rs = db
      .prepare(`SELECT ${HIT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE (f.path = ? OR f.path LIKE ?) AND (s.qualified_name = ? OR s.name = ?)`)
      .all(file, `%/${file}`, name, name);
    if (rs.length) return rs.map((r) => toHit(r));
  }
  const q = db.prepare(`SELECT ${HIT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.qualified_name = ? ORDER BY f.is_test, f.path`).all(ref);
  if (q.length) return q.map((r) => toHit(r));
  return db.prepare(`SELECT ${HIT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.name = ? ORDER BY f.is_test, s.exported DESC, f.path`).all(ref).map((r) => toHit(r));
}

export function getSymbolDetail(db: Db, id: string, maxCallers = 20): SymbolDetail | null {
  const r = db.prepare(`SELECT s.*, f.path, f.is_test FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.id = ?`).get(id);
  if (!r) return null;
  const parent = r.parent_id ? db.prepare('SELECT qualified_name FROM symbols WHERE id = ?').get(String(r.parent_id)) : undefined;
  const callersTotal = Number(db.prepare('SELECT COUNT(*) n FROM calls WHERE callee_id = ?').get(id)?.n ?? 0);
  return {
    ...toHit(r),
    params: JSON.parse(String(r.params_json)) as Param[],
    returnType: r.return_type === null ? null : String(r.return_type),
    minArity: Number(r.min_arity),
    maxArity: r.max_arity === null ? null : Number(r.max_arity),
    docstring: r.docstring === null ? null : String(r.docstring),
    decorators: JSON.parse(String(r.decorators_json)) as string[],
    isAsync: Number(r.is_async) === 1,
    isDefaultExport: Number(r.is_default_export) === 1,
    parent: parent ? String(parent.qualified_name) : null,
    members: db
      .prepare('SELECT name, kind, start_line FROM symbols WHERE parent_id = ? ORDER BY start_line')
      .all(id)
      .map((m) => ({ name: String(m.name), kind: String(m.kind) as SymbolKind, line: Number(m.start_line) })),
    callers: db
      .prepare(
        `SELECT f.path, c.line, s.qualified_name caller, c.confidence FROM calls c JOIN files f ON f.id = c.file_id
         LEFT JOIN symbols s ON s.id = c.caller_id WHERE c.callee_id = ? ORDER BY f.is_test, f.path, c.line LIMIT ?`,
      )
      .all(id, maxCallers)
      .map((c) => ({ file: String(c.path), line: Number(c.line), caller: c.caller === null ? null : String(c.caller), confidence: c.confidence === null ? null : String(c.confidence) })),
    callersTotal,
    callees: db
      .prepare(
        `SELECT c.callee_text, c.line, t.qualified_name target, c.confidence FROM calls c LEFT JOIN symbols t ON t.id = c.callee_id
         WHERE c.caller_id = ? ORDER BY c.line LIMIT 50`,
      )
      .all(id)
      .map((c) => ({ name: String(c.callee_text), line: Number(c.line), target: c.target === null ? null : String(c.target), confidence: c.confidence === null ? null : String(c.confidence) })),
  };
}

export interface IndexStats {
  files: number;
  filesByLanguage: Record<string, number>;
  filesSkipped: number;
  filesPartial: number;
  lines: number;
  symbols: number;
  symbolsByKind: Record<string, number>;
  imports: number;
  importsInternal: number;
  importsResolved: number;
  importsExternal: number;
  calls: number;
  callsByConfidence: Record<string, number>;
  literals: number;
  lastRefresh: number | null;
  backend: string;
}

function groupCount(db: Db, sql: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of db.prepare(sql).all()) out[String(r.k ?? 'null')] = Number(r.n);
  return out;
}

export function indexStats(db: Db): IndexStats {
  const one = (sql: string) => Number(db.prepare(sql).get()?.n ?? 0);
  const last = db.prepare("SELECT value FROM meta WHERE key = 'last_refresh'").get();
  const importsExternal = one("SELECT COUNT(*) n FROM imports WHERE unresolved_reason = 'external'");
  const imports = one('SELECT COUNT(*) n FROM imports');
  return {
    files: one('SELECT COUNT(*) n FROM files'),
    filesByLanguage: groupCount(db, 'SELECT language k, COUNT(*) n FROM files GROUP BY language'),
    filesSkipped: one("SELECT COUNT(*) n FROM files WHERE status = 'skipped'"),
    filesPartial: one("SELECT COUNT(*) n FROM files WHERE status = 'partial'"),
    lines: one('SELECT COALESCE(SUM(lines), 0) n FROM files'),
    symbols: one('SELECT COUNT(*) n FROM symbols'),
    symbolsByKind: groupCount(db, 'SELECT kind k, COUNT(*) n FROM symbols GROUP BY kind'),
    imports,
    importsInternal: imports - importsExternal,
    importsResolved: one('SELECT COUNT(*) n FROM imports WHERE resolved_file_id IS NOT NULL'),
    importsExternal,
    calls: one('SELECT COUNT(*) n FROM calls'),
    callsByConfidence: groupCount(db, 'SELECT confidence k, COUNT(*) n FROM calls GROUP BY confidence'),
    literals: one('SELECT COUNT(*) n FROM literals'),
    lastRefresh: last ? Number(last.value) : null,
    backend: db.backend,
  };
}

// --- Grounding reads (Phase 4): raw per-file facts the call verifier needs.

export interface FileFacts {
  id: number;
  path: string;
  language: string | null;
  status: string;
  isTest: boolean;
  isGenerated: boolean;
}

export interface ImportFact {
  module: string;
  name: string;
  alias: string | null;
  kind: string;
  line: number;
  isTypeOnly: boolean;
  resolvedFileId: number | null;
  unresolvedReason: string | null;
}

export interface CallFact {
  callerId: string | null;
  calleeText: string;
  calleeName: string;
  line: number;
  column: number;
  argCount: number;
  keywordArgs: string[];
  hasSpread: boolean;
  calleeId: string | null;
  confidence: string | null;
}

export interface SymbolFact {
  id: string;
  fileId: number;
  file: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  line: number;
  endLine: number;
  startByte: number;
  endByte: number;
  signature: string;
  params: Param[];
  minArity: number;
  maxArity: number | null;
  decorators: string[];
  exported: boolean;
  isDefaultExport: boolean;
  parentId: string | null;
}

const FACT_COLS = `s.id, s.file_id, f.path, s.name, s.qualified_name, s.kind, s.start_line, s.end_line, s.start_byte, s.end_byte, s.signature,
  s.params_json, s.min_arity, s.max_arity, s.decorators_json, s.exported, s.is_default_export, s.parent_id`;

function toFact(r: Row): SymbolFact {
  return {
    id: String(r.id),
    fileId: Number(r.file_id),
    file: String(r.path),
    name: String(r.name),
    qualifiedName: String(r.qualified_name),
    kind: String(r.kind) as SymbolKind,
    line: Number(r.start_line),
    endLine: Number(r.end_line),
    startByte: Number(r.start_byte),
    endByte: Number(r.end_byte),
    signature: String(r.signature),
    params: JSON.parse(String(r.params_json)) as Param[],
    minArity: Number(r.min_arity),
    maxArity: r.max_arity === null ? null : Number(r.max_arity),
    decorators: JSON.parse(String(r.decorators_json)) as string[],
    exported: Number(r.exported) === 1,
    isDefaultExport: Number(r.is_default_export) === 1,
    parentId: r.parent_id === null ? null : String(r.parent_id),
  };
}

function toFileFacts(r: Row): FileFacts {
  return {
    id: Number(r.id),
    path: String(r.path),
    language: r.language === null ? null : String(r.language),
    status: String(r.status),
    isTest: Number(r.is_test) === 1,
    isGenerated: Number(r.is_generated) === 1,
  };
}

export function fileFacts(db: Db, ref: string | number): FileFacts | null {
  const r =
    typeof ref === 'number'
      ? db.prepare('SELECT id, path, language, status, is_test, is_generated FROM files WHERE id = ?').get(ref)
      : db.prepare('SELECT id, path, language, status, is_test, is_generated FROM files WHERE path = ?').get(ref);
  return r ? toFileFacts(r) : null;
}

export function importFacts(db: Db, fileId: number): ImportFact[] {
  return db
    .prepare('SELECT module, name, alias, kind, line, is_type_only, resolved_file_id, unresolved_reason FROM imports WHERE file_id = ? ORDER BY line, id')
    .all(fileId)
    .map((r) => ({
      module: String(r.module),
      name: String(r.name),
      alias: r.alias === null ? null : String(r.alias),
      kind: String(r.kind),
      line: Number(r.line),
      isTypeOnly: Number(r.is_type_only) === 1,
      resolvedFileId: r.resolved_file_id === null ? null : Number(r.resolved_file_id),
      unresolvedReason: r.unresolved_reason === null ? null : String(r.unresolved_reason),
    }));
}

export function callFacts(db: Db, fileId: number): CallFact[] {
  return db
    .prepare('SELECT caller_id, callee_text, callee_name, line, col, arg_count, keyword_args_json, has_spread, callee_id, confidence FROM calls WHERE file_id = ? ORDER BY line, col')
    .all(fileId)
    .map((r) => ({
      callerId: r.caller_id === null ? null : String(r.caller_id),
      calleeText: String(r.callee_text),
      calleeName: String(r.callee_name),
      line: Number(r.line),
      column: Number(r.col),
      argCount: Number(r.arg_count),
      keywordArgs: JSON.parse(String(r.keyword_args_json)) as string[],
      hasSpread: Number(r.has_spread) === 1,
      calleeId: r.callee_id === null ? null : String(r.callee_id),
      confidence: r.confidence === null ? null : String(r.confidence),
    }));
}

export function symbolFact(db: Db, id: string): SymbolFact | null {
  const r = db.prepare(`SELECT ${FACT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.id = ?`).get(id);
  return r ? toFact(r) : null;
}

/** Top-level symbols of a file (parent_id IS NULL), in source order. */
export function topLevelFacts(db: Db, fileId: number): SymbolFact[] {
  return db.prepare(`SELECT ${FACT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.file_id = ? AND s.parent_id IS NULL ORDER BY s.start_line`).all(fileId).map(toFact);
}

export function memberFacts(db: Db, parentId: string): SymbolFact[] {
  return db.prepare(`SELECT ${FACT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.parent_id = ? ORDER BY s.start_line`).all(parentId).map(toFact);
}

export function exportAliasFacts(db: Db, fileId: number): { local: string; exported: string }[] {
  return db.prepare('SELECT local_name, exported_name FROM export_aliases WHERE file_id = ?').all(fileId).map((r) => ({ local: String(r.local_name), exported: String(r.exported_name) }));
}

/** Every named symbol, for "did you mean" ranking. Cheap enough to scan: ~10k rows on a 100k-line repo. */
export function suggestionPool(db: Db, kinds: SymbolKind[]): SymbolFact[] {
  const marks = kinds.map(() => '?').join(',');
  return db.prepare(`SELECT ${FACT_COLS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.kind IN (${marks}) AND f.is_test = 0`).all(...kinds).map(toFact);
}

export interface FingerprintedSymbol extends SymbolHit {
  fingerprint: import('../types.js').BodyFingerprint;
  params: Param[];
  returnType: string | null;
  docstring: string | null;
  isGenerated: boolean;
}

export function readFingerprintedSymbols(db: Db): FingerprintedSymbol[] {
  return db.prepare(`SELECT s.*, f.path, f.is_test, f.is_generated FROM symbols s JOIN files f ON f.id = s.file_id
    WHERE s.minhash IS NOT NULL ORDER BY f.path, s.start_line`).all().map((r) => {
    const bytes = r.minhash as Uint8Array;
    return {
      ...toHit(r),
      fingerprint: { tokenCount: Number(r.token_count), normHash: String(r.norm_hash),
        minhash: new Uint32Array(Uint8Array.from(bytes).buffer), vocab: JSON.parse(String(r.vocab_json)) },
      params: JSON.parse(String(r.params_json)) as Param[],
      returnType: r.return_type === null ? null : String(r.return_type),
      docstring: r.docstring === null ? null : String(r.docstring),
      isGenerated: Number(r.is_generated) === 1,
    };
  });
}

export interface ReuseState {
  files: { id: number; file: string; hash: string; isTest: boolean; isGenerated: boolean; status: string }[];
  symbols: (SymbolHit & { startByte: number; endByte: number; parentId: string | null })[];
  calls: { file: string; callerId: string | null; calleeId: string | null; calleeText: string; line: number; column: number; argCount: number; confidence: string | null }[];
  literals: { file: string; symbolId: string | null; value: string; kind: import('../types.js').LiteralKind; line: number; constName: string | null }[];
}

/** Complete, uncapped call/literal data for before/after change analysis. */
export function readReuseState(db: Db): ReuseState {
  const nullable = (v: unknown) => v === null ? null : String(v);
  return {
    files: db.prepare('SELECT id, path, hash, is_test, is_generated, status FROM files ORDER BY path').all().map((r) => ({
      id: Number(r.id), file: String(r.path), hash: String(r.hash), isTest: Number(r.is_test) === 1,
      isGenerated: Number(r.is_generated) === 1, status: String(r.status),
    })),
    symbols: db.prepare(`SELECT s.*, f.path, f.is_test FROM symbols s JOIN files f ON f.id = s.file_id
      ORDER BY f.path, s.start_line, s.start_byte`).all().map((r) => ({
      ...toHit(r), startByte: Number(r.start_byte), endByte: Number(r.end_byte), parentId: nullable(r.parent_id),
    })),
    calls: db.prepare(`SELECT c.*, f.path FROM calls c JOIN files f ON f.id = c.file_id
      ORDER BY f.path, c.line, c.col, c.id`).all().map((r) => ({
      file: String(r.path), callerId: nullable(r.caller_id), calleeId: nullable(r.callee_id), calleeText: String(r.callee_text),
      line: Number(r.line), column: Number(r.col), argCount: Number(r.arg_count), confidence: nullable(r.confidence),
    })),
    literals: db.prepare(`SELECT l.*, f.path FROM literals l JOIN files f ON f.id = l.file_id
      ORDER BY f.path, l.line, l.id`).all().map((r) => ({
      file: String(r.path), symbolId: nullable(r.symbol_id), value: String(r.value),
      kind: String(r.kind) as import('../types.js').LiteralKind, line: Number(r.line), constName: nullable(r.const_name),
    })),
  };
}

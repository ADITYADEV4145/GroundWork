import type { Db } from '../store/db.js';
import type { ExtractResult } from '../lang/adapter.js';
import { splitWords } from '../extract/fingerprint.js';
import type { FileStatus, Language } from '../types.js';
import { symbolId } from './store.js';

export interface FileMeta {
  path: string;
  language: Language | null;
  hash: string;
  size: number;
  mtimeMs: number;
  lines: number;
  isTest: boolean;
  isGenerated: boolean;
  status: FileStatus;
  skipReason: string | null;
}

/** Remove everything derived from a file but keep its row (and id) so other files' import links survive. */
export function clearFileRows(db: Db, fileId: number): void {
  db.prepare('DELETE FROM symbols_fts WHERE rowid IN (SELECT rowid FROM symbols WHERE file_id = ?)').run(fileId);
  for (const t of ['symbols', 'imports', 'calls', 'literals']) db.prepare(`DELETE FROM ${t} WHERE file_id = ?`).run(fileId);
}

export function deleteFile(db: Db, fileId: number): void {
  clearFileRows(db, fileId);
  db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
}

export function upsertFile(db: Db, existingId: number | null, meta: FileMeta, now: number): number {
  if (existingId !== null) {
    clearFileRows(db, existingId);
    db.prepare(
      'UPDATE files SET language=?, hash=?, size=?, mtime_ms=?, lines=?, indexed_at=?, is_test=?, is_generated=?, status=?, skip_reason=? WHERE id=?',
    ).run(meta.language, meta.hash, meta.size, Math.floor(meta.mtimeMs), meta.lines, now, +meta.isTest, +meta.isGenerated, meta.status, meta.skipReason, existingId);
    return existingId;
  }
  const r = db
    .prepare(
      'INSERT INTO files(path, language, hash, size, mtime_ms, lines, indexed_at, is_test, is_generated, status, skip_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(meta.path, meta.language, meta.hash, meta.size, Math.floor(meta.mtimeMs), meta.lines, now, +meta.isTest, +meta.isGenerated, meta.status, meta.skipReason);
  return r.lastInsertRowid;
}

export function writeExtraction(db: Db, fileId: number, file: string, ex: ExtractResult): void {
  const seen = new Map<string, number>();
  const ids = ex.symbols.map((s) => {
    const key = `${s.qualifiedName}\0${s.kind}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return symbolId(file, s.qualifiedName, s.kind, n);
  });
  const insSym = db.prepare(
    `INSERT INTO symbols(id, file_id, name, qualified_name, kind, start_line, end_line, start_byte, end_byte, signature, params_json,
      return_type, min_arity, max_arity, docstring, decorators_json, exported, is_default_export, is_async, parent_id,
      token_count, norm_hash, minhash, vocab_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insFts = db.prepare('INSERT INTO symbols_fts(rowid, symbol_id, name_words, docstring, signature, path) VALUES(?,?,?,?,?,?)');
  ex.symbols.forEach((s, i) => {
    const fp = s.fingerprint;
    const r = insSym.run(
      ids[i]!,
      fileId,
      s.name,
      s.qualifiedName,
      s.kind,
      s.startLine,
      s.endLine,
      s.startByte,
      s.endByte,
      s.signature,
      JSON.stringify(s.params),
      s.returnType,
      s.minArity,
      s.maxArity,
      s.docstring,
      JSON.stringify(s.decorators),
      +s.exported,
      +s.isDefaultExport,
      +s.isAsync,
      s.parent !== null ? ids[s.parent]! : null,
      fp?.tokenCount ?? null,
      fp?.normHash ?? null,
      fp ? new Uint8Array(fp.minhash.buffer, fp.minhash.byteOffset, fp.minhash.byteLength) : null,
      fp ? JSON.stringify(fp.vocab) : null,
    );
    const words = [...new Set([...splitWords(s.qualifiedName), s.name.toLowerCase()])].join(' ');
    insFts.run(r.lastInsertRowid, ids[i]!, words, s.docstring ?? '', s.signature, file);
  });
  const insImp = db.prepare('INSERT INTO imports(file_id, module, name, alias, kind, line, is_type_only) VALUES(?,?,?,?,?,?,?)');
  for (const im of ex.imports) insImp.run(fileId, im.module, im.name, im.alias, im.kind, im.line, +im.isTypeOnly);
  const insCall = db.prepare(
    'INSERT INTO calls(file_id, caller_id, callee_text, callee_name, line, col, arg_count, keyword_args_json, has_spread) VALUES(?,?,?,?,?,?,?,?,?)',
  );
  for (const c of ex.calls)
    insCall.run(fileId, c.caller !== null ? ids[c.caller]! : null, c.calleeText, c.calleeName, c.line, c.column, c.argCount, JSON.stringify(c.keywordArgs), +c.hasSpread);
  const insLit = db.prepare('INSERT INTO literals(file_id, symbol_id, value, kind, line, const_name) VALUES(?,?,?,?,?,?)');
  const litSeen = new Set<string>();
  for (const l of ex.literals) {
    const k = `${l.value}\0${l.kind}\0${l.line}`;
    if (litSeen.has(k)) continue;
    litSeen.add(k);
    insLit.run(fileId, l.symbol !== null ? ids[l.symbol]! : null, l.value, l.kind, l.line, l.constName);
  }
}

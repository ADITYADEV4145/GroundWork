import type { Db } from '../store/db.js';

/** Index contents with row ids and timestamps replaced by stable keys, for incremental-vs-full comparison. */
export function canonicalDump(db: Db): string {
  const q = (sql: string) => db.prepare(sql).all().map((r) => JSON.stringify(r)).sort();
  return JSON.stringify({
    files: q('SELECT path, language, hash, size, lines, is_test, is_generated, status, skip_reason FROM files'),
    symbols: q(
      `SELECT f.path, s.id, s.name, s.qualified_name, s.kind, s.start_line, s.end_line, s.start_byte, s.end_byte, s.signature, s.params_json,
        s.return_type, s.min_arity, s.max_arity, s.docstring, s.decorators_json, s.exported, s.is_default_export, s.is_async, s.parent_id,
        s.token_count, s.norm_hash, hex(s.minhash) mh, s.vocab_json FROM symbols s JOIN files f ON f.id = s.file_id`,
    ),
    fts: q('SELECT x.symbol_id, x.name_words, x.docstring, x.signature, x.path FROM symbols_fts x'),
    imports: q(
      `SELECT f.path, i.module, i.name, i.alias, i.kind, i.line, i.is_type_only, r.path target, i.unresolved_reason
       FROM imports i JOIN files f ON f.id = i.file_id LEFT JOIN files r ON r.id = i.resolved_file_id`,
    ),
    calls: q(
      `SELECT f.path, c.caller_id, c.callee_text, c.callee_name, c.line, c.col, c.arg_count, c.keyword_args_json, c.has_spread, c.callee_id, c.confidence
       FROM calls c JOIN files f ON f.id = c.file_id`,
    ),
    literals: q('SELECT f.path, l.symbol_id, l.value, l.kind, l.line, l.const_name FROM literals l JOIN files f ON f.id = l.file_id'),
  });
}

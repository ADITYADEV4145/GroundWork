import type { Db } from '../store/db.js';

// Human-readable index snapshot used by the extraction golden tests (fixtures/*/expected.json).

export interface GoldenSnapshot {
  symbols: string[];
  imports: string[];
  calls: string[];
  literals: string[];
}

const row = (r: Record<string, unknown>) => Object.values(r).map((v) => (v === null ? '-' : String(v))).join(' | ');

export function goldenSnapshot(db: Db): GoldenSnapshot {
  return {
    symbols: db
      .prepare(
        `SELECT f.path, s.qualified_name, s.kind, s.min_arity || '..' || COALESCE(s.max_arity, '*') arity,
          CASE WHEN s.exported = 1 THEN 'exported' ELSE 'local' END e, CASE WHEN s.is_default_export = 1 THEN 'default' ELSE '' END d,
          CASE WHEN s.is_async = 1 THEN 'async' ELSE '' END a, s.signature
         FROM symbols s JOIN files f ON f.id = s.file_id ORDER BY f.path, s.start_line, s.qualified_name`,
      )
      .all()
      .map(row),
    imports: db
      .prepare(
        `SELECT f.path, i.line, i.module, i.name, COALESCE(i.alias, '-') alias, i.kind, COALESCE(r.path, i.unresolved_reason) target
         FROM imports i JOIN files f ON f.id = i.file_id LEFT JOIN files r ON r.id = i.resolved_file_id ORDER BY f.path, i.line, i.name`,
      )
      .all()
      .map(row),
    calls: db
      .prepare(
        `SELECT f.path, c.line, c.callee_text, c.arg_count, c.keyword_args_json kw, COALESCE(t.qualified_name, '-') target, COALESCE(c.confidence, '-') conf
         FROM calls c JOIN files f ON f.id = c.file_id LEFT JOIN symbols t ON t.id = c.callee_id ORDER BY f.path, c.line, c.col`,
      )
      .all()
      .map(row),
    literals: db
      .prepare(`SELECT f.path, l.line, l.kind, l.value, COALESCE(l.const_name, '-') c FROM literals l JOIN files f ON f.id = l.file_id ORDER BY f.path, l.line, l.value`)
      .all()
      .map(row),
  };
}

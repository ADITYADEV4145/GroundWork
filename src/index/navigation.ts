import type { Db, Row } from '../store/db.js';
import type { SymbolKind } from '../types.js';

export interface NavigationSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  endLine: number;
  signature: string;
}

const SYMBOL = 's.id, s.qualified_name, s.kind, f.path, s.start_line, s.end_line, s.signature';
const FROM = 'FROM symbols s JOIN files f ON f.id = s.file_id';
const CALLERS = '(SELECT COUNT(*) FROM calls c WHERE c.callee_id = s.id)';
const lowerName = (column: string) =>
  `CASE WHEN length(${column}) = length(CAST(${column} AS BLOB)) THEN lower(${column}) ELSE gw_unicode_lower(${column}) END`;

function searchWords(value: string): string[] {
  return value
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
}

function separateLetterNumber(value: string, keepLeadingNumericWord = false): string {
  const numberToLetter = keepLeadingNumericWord ? /([\p{L}\p{M}]\p{N}+)(?=\p{L})/gu : /(\p{N})(?=\p{L})/gu;
  return value.replace(numberToLetter, '$1 ').replace(/(?<=[\p{L}\p{M}])(?=\p{N})/gu, ' ');
}

function isPrefixTerm(value: string): boolean {
  return !/\p{N}$/u.test(value);
}

function rankingTokens(value: string): string[] {
  // Keep standalone quantities like 2x intact, but recognize 3 as part of MP3s.
  return searchWords(value).flatMap((w) => separateLetterNumber(w.toLowerCase(), true).split(' '));
}

function matchesTerm(tokens: string[], parts: string[]): boolean {
  return tokens.some((_, i) => parts.every((part, j) =>
    j === parts.length - 1 && isPrefixTerm(part) ? tokens[i + j]?.startsWith(part) : tokens[i + j] === part));
}

function toSymbol(r: Row): NavigationSymbol {
  return {
    id: String(r.id),
    name: String(r.qualified_name),
    kind: String(r.kind) as SymbolKind,
    file: String(r.path),
    line: Number(r.start_line),
    endLine: Number(r.end_line),
    signature: String(r.signature),
  };
}

export function findCode(db: Db, query: string, kind?: SymbolKind, file?: string): (NavigationSymbol & { doc: string; score: number })[] {
  const q = query.toLowerCase();
  const termsByCase = searchWords(query).slice(0, 24);
  const words = [...new Set(termsByCase.map((w) => w.toLowerCase()))];
  const scoringWords = words.map((w) => separateLetterNumber(w).split(' '));
  const select = `SELECT ${SYMBOL}, s.name, s.docstring, s.exported, f.is_test, ${CALLERS} caller_count`;
  const filter = (kind ? ' AND s.kind = ?' : '') + (file ? ' AND f.path = ?' : '');
  const filterArgs = [...(kind ? [kind] : []), ...(file ? [file] : [])];
  const names = db.prepare(`${select} ${FROM}
    WHERE (instr(${lowerName('s.qualified_name')}, ?) > 0 OR instr(${lowerName('s.name')}, ?) > 0)${filter}
    ORDER BY f.path, s.start_line, s.id`).all(q, q, ...filterArgs);
  const candidates = new Map(names.map((r) => [String(r.id), r]));
  if (words.length) {
    // A sql.js-created FTS4 table can survive a switch to native SQLite even when refresh labels it FTS5.
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'symbols_fts' AND type = 'table'").get();
    const fts5 = /\bUSING\s+fts5\s*\(/i.test(String(schema?.sql ?? ''));
    // FTS4's simple tokenizer preserves the case of non-ASCII characters.
    const tokens = fts5 ? words : [...new Set([...words, ...termsByCase.filter((w) => /[^\x00-\x7f]/u.test(w))])];
    const prefix = (w: string) => fts5 ? `"${w}"*` : `"${w}*"`;
    const variants = (values: string[]) => [...new Set(values.flatMap((w) => [w, separateLetterNumber(w)]))];
    const search = db.prepare(`${select}, ${fts5 ? 'bm25(symbols_fts, 0, 5, 2, 2, 1)' : '0'} rank
      ${FROM} JOIN symbols_fts ON symbols_fts.rowid = s.rowid WHERE symbols_fts MATCH ?${filter}`);
    const terms = variants(tokens).map((w) => isPrefixTerm(w) ? prefix(w) : `"${w}"`).join(' OR ');
    for (const r of search.all(terms, ...filterArgs)) candidates.set(String(r.id), r);

    // SQLite treats HTTP2Server as one token. Verify expanded matches so HTTP20 still cannot match HTTP2.
    const numbered = (w: string) => !isPrefixTerm(w) && /\p{L}/u.test(w);
    const expanded = variants(tokens.filter(numbered)).map(prefix).join(' OR ');
    if (expanded) {
      const required = words.filter(numbered).map((w) => separateLetterNumber(w).split(' '));
      for (const r of search.all(expanded, ...filterArgs)) {
        const id = String(r.id);
        if (candidates.has(id)) continue;
        const fields = [r.qualified_name, r.docstring, r.signature, r.path];
        if (fields.some((field) => {
          const fieldTokens = rankingTokens(String(field ?? ''));
          return required.some((parts) => matchesTerm(fieldTokens, parts));
        })) candidates.set(id, r);
      }
    }
  }
  return [...candidates.values()].map((r) => {
    const s = toSymbol(r);
    const doc = String(r.docstring ?? '').trim();
    const overlap = (value: string) => {
      const tokens = rankingTokens(value);
      const matched = scoringWords.filter((parts) => matchesTerm(tokens, parts));
      return matched.length / Math.max(1, scoringWords.length);
    };
    const name = String(r.name).toLowerCase();
    const qualified = s.name.toLowerCase();
    const lexical = Math.max(0, -Number(r.rank ?? 0));
    const score =
      (qualified === q || name === q ? 100 : name.startsWith(q) ? 50 : qualified.includes(q) || name.includes(q) ? 20 : 0)
      + 30 * overlap(s.name) + 12 * overlap(doc) + 10 * overlap(s.signature) + 8 * overlap(s.file)
      + (8 * lexical) / (1 + lexical) + Math.min(6, Math.log2(1 + Number(r.caller_count)))
      + Number(r.exported) * 2 - Number(r.is_test) * 3;
    return { ...s, doc: doc.split(/\r?\n/, 1)[0] ?? '', score: Math.round(score * 10) / 10 };
  }).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id));
}

export function fileOutline(db: Db, file: string): { symbols: NavigationSymbol[]; status: string; reason: string | null; lines: number } | null {
  const row = db.prepare('SELECT status, skip_reason, lines FROM files WHERE path = ?').get(file);
  if (!row) return null;
  return {
    status: String(row.status),
    reason: row.skip_reason ? String(row.skip_reason) : null,
    lines: Number(row.lines),
    symbols: db.prepare(`SELECT ${SYMBOL} ${FROM} WHERE f.path = ? ORDER BY s.start_line, s.start_byte, s.id`).all(file).map(toSymbol),
  };
}

export function navigationSymbols(db: Db, ref: string): NavigationSymbol[] {
  const byId = db.prepare(`SELECT ${SYMBOL} ${FROM} WHERE s.id = ?`).get(ref);
  if (byId) return [toSymbol(byId)];
  const colon = ref.lastIndexOf(':');
  const file = colon > 0 ? ref.slice(0, colon) : null;
  const name = file ? ref.slice(colon + 1) : ref;
  const rows = db.prepare(`SELECT ${SYMBOL} ${FROM}
    WHERE (s.name = ? OR s.qualified_name = ?) ${file ? 'AND f.path = ?' : ''}
    ORDER BY (s.qualified_name = ?) DESC, f.is_test, s.exported DESC, f.path, s.start_line, s.id`)
    .all(name, name, ...(file ? [file] : []), name);
  return rows.map(toSymbol);
}

export function sourceLocation(db: Db, id: string): { hash: string; start: number; end: number } | null {
  const r = db.prepare(`SELECT f.hash, s.start_byte, s.end_byte ${FROM} WHERE s.id = ?`).get(id);
  // The WASM parser exposes offsets in JS string units despite the column names.
  return r ? { hash: String(r.hash), start: Number(r.start_byte), end: Number(r.end_byte) } : null;
}

export function symbolCalls(db: Db, id: string, direction: 'callers' | 'callees') {
  const callers = direction === 'callers';
  const ref = callers ? 'caller' : 'callee';
  return db.prepare(`SELECT f.path, c.line, other.qualified_name, c.callee_text, c.confidence
    FROM calls c JOIN files f ON f.id = c.file_id LEFT JOIN symbols other ON other.id = c.${ref}_id
    WHERE c.${callers ? 'callee' : 'caller'}_id = ?
    ORDER BY CASE c.confidence WHEN 'exact' THEN 0 WHEN 'import-resolved' THEN 1 WHEN 'name-only' THEN 2 ELSE 3 END,
      f.is_test, f.path, c.line, c.col, c.id`).all(id).map((r) => ({
    file: String(r.path),
    line: Number(r.line),
    name: String(r.qualified_name ?? (callers ? '<module>' : r.callee_text)),
    confidence: String(r.confidence ?? 'unresolved'),
  }));
}

export function whereUsed(db: Db, name: string) {
  return db.prepare(`WITH refs AS (
    SELECT c.file_id, c.line, 'call' kind, c.callee_text detail, c.confidence
      FROM calls c LEFT JOIN symbols s ON s.id = c.callee_id
      WHERE c.callee_name = ? OR c.callee_text = ? OR s.name = ? OR s.qualified_name = ?
    UNION
    SELECT i.file_id, i.line, 'import', i.name || COALESCE(' as ' || i.alias, '') || ' from ' || i.module, NULL
      FROM imports i WHERE i.name = ? OR i.alias = ? OR i.module = ?
    UNION
    SELECT l.file_id, l.line, 'literal', l.value, NULL FROM literals l
      WHERE l.const_name = ? OR instr(l.value, ?) > 0
  )
  SELECT f.path, refs.line, refs.kind, refs.detail, refs.confidence FROM refs JOIN files f ON f.id = refs.file_id
  ORDER BY f.path, refs.line, refs.kind, refs.detail, refs.confidence`).all(name, name, name, name, name, name, name, name, name)
    .map((r) => ({ file: String(r.path), line: Number(r.line), kind: String(r.kind), detail: String(r.detail), confidence: r.confidence ? String(r.confidence) : null }));
}

export function mapFiles(db: Db, scope: string) {
  const files = db.prepare(`SELECT id, path FROM files WHERE ? = '' OR path = ? OR substr(path, 1, length(?) + 1) = ? || '/'`)
    .all(scope, scope, scope, scope);
  const byId = new Map(files.map((r) => [Number(r.id), { path: String(r.path), symbols: [] as string[], score: 1 }]));
  const rows = db.prepare(`WITH ranked AS (
    SELECT f.id file_id, s.qualified_name, (3 * s.exported + ${CALLERS} + 1) weight,
      ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY (3 * s.exported + ${CALLERS} + 1) DESC, s.start_line, s.id) n
    ${FROM} WHERE s.parent_id IS NULL AND (? = '' OR f.path = ? OR substr(f.path, 1, length(?) + 1) = ? || '/')
  ) SELECT file_id, qualified_name, weight FROM ranked WHERE n <= 3 ORDER BY file_id, n`).all(scope, scope, scope, scope);
  for (const row of rows) {
    const file = byId.get(Number(row.file_id))!;
    file.symbols.push(String(row.qualified_name));
    file.score += Number(row.weight);
  }
  return [...byId.values()];
}

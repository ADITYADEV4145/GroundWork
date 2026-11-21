import type { Db } from './db.js';

// Bump on any change to the DDL or to what extraction writes. The index is a cache: on mismatch it is
// rebuilt from scratch rather than migrated.
export const SCHEMA_VERSION = 2;

export const DDL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  language TEXT,
  hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL DEFAULT 0,
  lines INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0,
  is_generated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  skip_reason TEXT
);

CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL,
  signature TEXT NOT NULL,
  params_json TEXT NOT NULL,
  return_type TEXT,
  min_arity INTEGER NOT NULL,
  max_arity INTEGER,
  docstring TEXT,
  decorators_json TEXT NOT NULL,
  exported INTEGER NOT NULL,
  is_default_export INTEGER NOT NULL,
  is_async INTEGER NOT NULL,
  parent_id TEXT,
  token_count INTEGER,
  norm_hash TEXT,
  minhash BLOB,
  vocab_json TEXT
);
CREATE INDEX IF NOT EXISTS symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS symbols_file ON symbols(file_id);
CREATE INDEX IF NOT EXISTS symbols_parent ON symbols(parent_id);
CREATE INDEX IF NOT EXISTS symbols_norm_hash ON symbols(norm_hash);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  alias TEXT,
  kind TEXT NOT NULL,
  line INTEGER NOT NULL,
  is_type_only INTEGER NOT NULL DEFAULT 0,
  resolved_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  unresolved_reason TEXT
);
CREATE INDEX IF NOT EXISTS imports_file ON imports(file_id);
CREATE INDEX IF NOT EXISTS imports_resolved ON imports(resolved_file_id);
CREATE INDEX IF NOT EXISTS imports_module ON imports(module);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  caller_id TEXT,
  callee_text TEXT NOT NULL,
  callee_name TEXT NOT NULL,
  line INTEGER NOT NULL,
  col INTEGER NOT NULL,
  arg_count INTEGER NOT NULL,
  keyword_args_json TEXT NOT NULL,
  has_spread INTEGER NOT NULL,
  callee_id TEXT,
  confidence TEXT
);
CREATE INDEX IF NOT EXISTS calls_callee_name ON calls(callee_name);
CREATE INDEX IF NOT EXISTS calls_callee_id ON calls(callee_id);
CREATE INDEX IF NOT EXISTS calls_caller ON calls(caller_id);
CREATE INDEX IF NOT EXISTS calls_file ON calls(file_id);

CREATE TABLE IF NOT EXISTS literals (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  symbol_id TEXT,
  value TEXT NOT NULL,
  kind TEXT NOT NULL,
  line INTEGER NOT NULL,
  const_name TEXT
);
CREATE INDEX IF NOT EXISTS literals_value ON literals(value);
CREATE INDEX IF NOT EXISTS literals_file ON literals(file_id);

-- export { local as exported } / module.exports = { exported: local }
CREATE TABLE IF NOT EXISTS export_aliases (
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  local_name TEXT NOT NULL,
  exported_name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS export_aliases_file ON export_aliases(file_id);

`;

// FTS5 (BM25 ranking) is used when available; the sql.js build only ships FTS4, so search ranks in JS there.
const FTS_COLUMNS = 'symbol_id UNINDEXED, name_words, docstring, signature, path';
export type FtsFlavor = 'fts5' | 'fts4';

function createFts(db: Db): FtsFlavor {
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(${FTS_COLUMNS}, tokenize = 'unicode61')`);
    return 'fts5';
  } catch {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts4(symbol_id, name_words, docstring, signature, path, notindexed=symbol_id)`);
    return 'fts4';
  }
}

export function readMeta(db: Db, key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? String(row.value) : null;
  } catch {
    return null;
  }
}

export function writeMeta(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

const TABLES = ['symbols_fts', 'export_aliases', 'literals', 'calls', 'imports', 'symbols', 'files', 'meta'];

/** Create tables; if the stored schema/tool/config fingerprint differs, drop everything and start clean. */
export function ensureSchema(db: Db, fingerprint: { toolVersion: string; configHash: string }): { rebuilt: boolean; fts: FtsFlavor } {
  const version = readMeta(db, 'schema_version');
  const tool = readMeta(db, 'tool_version');
  const cfg = readMeta(db, 'config_hash');
  const stale =
    version !== null && (version !== String(SCHEMA_VERSION) || tool !== fingerprint.toolVersion || cfg !== fingerprint.configHash);
  if (stale) {
    for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  db.exec(DDL);
  const fts = createFts(db);
  db.transaction(() => {
    writeMeta(db, 'fts', fts);
    writeMeta(db, 'schema_version', String(SCHEMA_VERSION));
    writeMeta(db, 'tool_version', fingerprint.toolVersion);
    writeMeta(db, 'config_hash', fingerprint.configHash);
  });
  return { rebuilt: stale || version === null, fts };
}

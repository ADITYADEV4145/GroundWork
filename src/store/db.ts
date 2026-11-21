import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Minimal synchronous SQLite surface shared by both backends. node:sqlite is preferred; sql.js (WASM) is
// the fallback for Node builds without it.

export type SqlValue = string | number | bigint | null | Uint8Array;
export type Row = Record<string, SqlValue>;

export interface Statement {
  run(...params: SqlValue[]): { changes: number; lastInsertRowid: number };
  get(...params: SqlValue[]): Row | undefined;
  all(...params: SqlValue[]): Row[];
}

export interface Db {
  readonly backend: 'node:sqlite' | 'sql.js';
  readonly path: string;
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(fn: () => T): T;
  close(): void;
}

const require = createRequire(import.meta.url);

type NodeSqlite = typeof import('node:sqlite');
let nodeSqlite: NodeSqlite | null | undefined;

function loadNodeSqlite(): NodeSqlite | null {
  if (nodeSqlite !== undefined) return nodeSqlite;
  if (process.env.GW_FORCE_SQLJS === '1') return (nodeSqlite = null);
  try {
    // Suppress the ExperimentalWarning emitted on some Node 22 releases.
    const emit = process.emitWarning;
    process.emitWarning = (() => undefined) as typeof process.emitWarning;
    try {
      nodeSqlite = require('node:sqlite') as NodeSqlite;
    } finally {
      process.emitWarning = emit;
    }
  } catch {
    nodeSqlite = null;
  }
  return nodeSqlite;
}

export function sqliteBackendAvailable(): 'node:sqlite' | 'sql.js' {
  return loadNodeSqlite() ? 'node:sqlite' : 'sql.js';
}

let txDepth = new WeakMap<object, number>();

function wrapTransaction<T>(owner: object, exec: (sql: string) => void, fn: () => T): T {
  const depth = txDepth.get(owner) ?? 0;
  if (depth > 0) {
    txDepth.set(owner, depth + 1);
    try {
      return fn();
    } finally {
      txDepth.set(owner, depth);
    }
  }
  exec('BEGIN IMMEDIATE');
  txDepth.set(owner, 1);
  try {
    const out = fn();
    exec('COMMIT');
    return out;
  } catch (err) {
    exec('ROLLBACK');
    throw err;
  } finally {
    txDepth.set(owner, 0);
  }
}

function openNode(mod: NodeSqlite, file: string, readonly: boolean): Db {
  const db = new mod.DatabaseSync(file, readonly ? { readOnly: true } : {});
  if (!readonly) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  const self: Db = {
    backend: 'node:sqlite',
    path: file,
    exec: (sql) => db.exec(sql),
    prepare(sql) {
      const st = db.prepare(sql);
      return {
        run: (...p) => {
          const r = st.run(...(p as never[]));
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        },
        get: (...p) => st.get(...(p as never[])) as Row | undefined,
        all: (...p) => st.all(...(p as never[])) as Row[],
      };
    },
    transaction: (fn) => wrapTransaction(self, (s) => db.exec(s), fn),
    close: () => db.close(),
  };
  return self;
}

type SqlJsStatic = import('sql.js').SqlJsStatic;
let sqlJs: SqlJsStatic | null = null;

/** sql.js needs async init once; call before openDb when node:sqlite is missing. */
export async function initSqlBackend(): Promise<void> {
  if (loadNodeSqlite() || sqlJs) return;
  const init = require('sql.js') as (cfg?: object) => Promise<SqlJsStatic>;
  sqlJs = await init();
}

function openSqlJs(file: string, readonly: boolean): Db {
  if (!sqlJs) throw new Error('sql.js backend not initialized; call initSqlBackend() first');
  const data = file !== ':memory:' && existsSync(file) ? readFileSync(file) : undefined;
  const db = new sqlJs.Database(data);
  // Deletes rely on ON DELETE CASCADE, which SQLite only enforces with this pragma.
  db.exec('PRAGMA foreign_keys = ON');
  let dirty = false;
  const persist = () => {
    if (readonly || file === ':memory:' || !dirty) return;
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, db.export());
    // export() reopens the database, which resets connection pragmas.
    db.exec('PRAGMA foreign_keys = ON');
    renameSync(tmp, file);
    dirty = false;
  };
  const self: Db = {
    backend: 'sql.js',
    path: file,
    exec: (sql) => {
      db.exec(sql);
      dirty = true;
      if ((txDepth.get(self) ?? 0) === 0 && /^\s*COMMIT/i.test(sql)) persist();
    },
    prepare(sql) {
      return {
        run: (...p) => {
          const st = db.prepare(sql);
          try {
            st.run(p as never);
          } finally {
            st.free();
          }
          dirty = true;
          const changes = db.getRowsModified();
          const id = db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
          return { changes, lastInsertRowid: Number(id ?? 0) };
        },
        get: (...p) => {
          const st = db.prepare(sql);
          try {
            st.bind(p as never);
            return st.step() ? (st.getAsObject() as Row) : undefined;
          } finally {
            st.free();
          }
        },
        all: (...p) => {
          const st = db.prepare(sql);
          const rows: Row[] = [];
          try {
            st.bind(p as never);
            while (st.step()) rows.push(st.getAsObject() as Row);
          } finally {
            st.free();
          }
          return rows;
        },
      };
    },
    transaction: (fn) => {
      const out = wrapTransaction(self, (s) => db.exec(s), fn);
      if ((txDepth.get(self) ?? 0) === 0) {
        dirty = true;
        persist();
      }
      return out;
    },
    close: () => {
      persist();
      db.close();
    },
  };
  return self;
}

export function openDb(file: string, opts: { readonly?: boolean } = {}): Db {
  const mod = loadNodeSqlite();
  if (mod) return openNode(mod, file, opts.readonly ?? false);
  return openSqlJs(file, opts.readonly ?? false);
}

/** Test hook: forget the cached backend choice. */
export function resetBackendForTests(): void {
  nodeSqlite = undefined;
  txDepth = new WeakMap();
}

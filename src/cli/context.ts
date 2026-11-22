import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import type { GroundworkConfig } from '../config/schema.js';
import type { Db } from '../store/db.js';
import { findRepoRoot } from '../util/paths.js';
import type { GlobalOpts } from './output.js';

export function globalOpts(cmd: Command): GlobalOpts {
  return cmd.optsWithGlobals<GlobalOpts>();
}

/** --root is taken as given; otherwise the git toplevel (or nearest .groundwork) above cwd. */
export function repoRoot(opts: GlobalOpts): string {
  return opts.root ? path.resolve(opts.root) : findRepoRoot(process.cwd());
}

export interface ReadContext {
  root: string;
  config: GroundworkConfig;
  db: Db;
}

/** Bring the index up to date (cheap when nothing changed), then open it for reading. */
export async function withIndex<T>(opts: GlobalOpts & { refresh?: boolean }, fn: (ctx: ReadContext) => T | Promise<T>): Promise<T> {
  const { loadConfig } = await import('../config/load.js');
  const { refreshIndex } = await import('../index/refresh.js');
  const { indexDbPath } = await import('../index/store.js');
  const { initSqlBackend, openDb } = await import('../store/db.js');
  const root = repoRoot(opts);
  const config = loadConfig(root);
  await initSqlBackend();
  if (opts.refresh !== false || !existsSync(indexDbPath(root))) await refreshIndex(root, { config });
  const db = openDb(indexDbPath(root), { readonly: true });
  try {
    return await fn({ root, config, db });
  } finally {
    db.close();
  }
}

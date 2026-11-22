import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import { openDb, type Db } from '../store/db.js';
import { ensureSchema, type FtsFlavor } from '../store/schema.js';
import { sha1 } from '../util/hash.js';
import { ensureGwDir, gwPath } from '../util/paths.js';
import { VERSION } from '../util/version.js';

/** Bump when extraction output changes so existing indexes rebuild on next refresh. */
export const EXTRACTOR_VERSION = 5;

export function indexDbPath(root: string): string {
  return gwPath(root, 'index.db');
}

/** Config keys that change what lands in the index; editing them forces a clean rebuild. */
export function indexConfigHash(config: GroundworkConfig): string {
  return sha1(JSON.stringify(config.index)).slice(0, 12);
}

export interface OpenIndex {
  db: Db;
  fts: FtsFlavor;
  rebuilt: boolean;
}

export function openIndex(root: string, config: GroundworkConfig): OpenIndex {
  ensureGwDir(root);
  const db = openDb(indexDbPath(root));
  const { rebuilt, fts } = ensureSchema(db, { toolVersion: `${VERSION}+x${EXTRACTOR_VERSION}`, configHash: indexConfigHash(config) });
  return { db, fts, rebuilt };
}

export function symbolId(file: string, qualifiedName: string, kind: string, ordinal: number): string {
  return sha1(`${file}\0${qualifiedName}\0${kind}\0${ordinal}`).slice(0, 16);
}

export function dirOf(p: string): string {
  const d = path.posix.dirname(p);
  return d === '.' ? '' : d;
}

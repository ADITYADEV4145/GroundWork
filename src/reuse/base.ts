import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import type { GroundworkConfig } from '../config/schema.js';
import { looksGenerated, makeTestMatcher } from '../index/discover.js';
import { withWriteLock } from '../index/lock.js';
import { readReuseState, type ReuseState } from '../index/query.js';
import { EXTRACTOR_VERSION, indexConfigHash, indexDbPath, openIndex } from '../index/store.js';
import { deleteFile, upsertFile, writeExtraction } from '../index/write.js';
import { adapterFor, languageForPath } from '../lang/index.js';
import { linkIndex } from '../resolve/link.js';
import { openDb } from '../store/db.js';
import { SCHEMA_VERSION } from '../store/schema.js';
import { sha1 } from '../util/hash.js';
import { ensureGwDir } from '../util/paths.js';
import { VERSION } from '../util/version.js';

export function git(root: string, args: string[], deadline: number): string {
  if (Date.now() >= deadline) throw new Error('reuse check timed out');
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: Math.min(30_000, deadline - Date.now()),
    maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A commit-keyed index built by the unchanged Phase 1 extractor and resolver. */
export function readBase(root: string, commit: string, config: GroundworkConfig, deadline: number): { root: string; state: ReuseState } {
  const key = sha1(`${commit}:${indexConfigHash(config)}:${EXTRACTOR_VERSION}:${SCHEMA_VERSION}:${VERSION}`);
  const directory = ensureGwDir(root, 'reuse', 'bases', key);
  const ready = path.join(directory, 'ready');
  if (!existsSync(ready)) withWriteLock(directory, () => {
    if (existsSync(ready)) return;
    const entries = git(root, ['ls-tree', '-rz', '--full-tree', commit], deadline).split('\0').filter(Boolean);
    const include = config.index.include.length ? picomatch(config.index.include, { dot: true }) : null;
    const exclude = config.index.exclude.length ? picomatch(config.index.exclude, { dot: true }) : null;
    const isTest = makeTestMatcher(config);
    const { db } = openIndex(directory, config);
    try {
      db.transaction(() => {
        for (const file of readReuseState(db).files) deleteFile(db, file.id);
        for (const entry of entries) {
          const tab = entry.indexOf('\t');
          const [mode, type] = entry.slice(0, tab).split(' ');
          const file = entry.slice(tab + 1);
          if (type !== 'blob' || !/^100(644|755)$/.test(mode ?? '') || path.isAbsolute(file) || file.split('/').some((p) =>
            ['..', '.git', '.groundwork', 'node_modules', 'dist', 'build', '.venv', '__pycache__', 'coverage'].includes(p))) continue;
          const language = languageForPath(file);
          const resolverConfig = file === 'tsconfig.json' || file === 'jsconfig.json';
          if (!resolverConfig && (!language || (include && !include(file)) || (exclude && exclude(file)))) continue;
          const source = git(root, ['show', `${commit}:${file}`], deadline);
          const absolute = path.join(directory, file);
          mkdirSync(path.dirname(absolute), { recursive: true });
          writeFileSync(absolute, source);
          if (!language) continue;
          const generated = looksGenerated(file, source);
          const skipped = Buffer.byteLength(source) > config.index.maxFileBytes || (generated && config.index.skipGenerated);
          const extraction = skipped ? null : adapterFor(language).extract(source, language);
          const id = upsertFile(db, null, { path: file, language, hash: sha1(source), size: Buffer.byteLength(source),
            mtimeMs: 0, lines: source.split('\n').length, isTest: isTest(file), isGenerated: generated,
            status: skipped ? 'skipped' : extraction?.hasErrors ? 'partial' : 'ok', skipReason: skipped ? 'reuse-base-skip' : null }, Date.now());
          if (extraction) writeExtraction(db, id, file, extraction);
        }
        linkIndex(db, directory);
      });
    } finally {
      db.close();
    }
    writeFileSync(ready, commit);
  }, Math.max(0, Math.min(100, deadline - Date.now())));
  const db = openDb(indexDbPath(directory), { readonly: true });
  try {
    return { root: directory, state: readReuseState(db) };
  } finally {
    db.close();
  }
}

export function symbolSource(root: string, symbol: ReuseState['symbols'][number]): string {
  return readFileSync(path.join(root, symbol.file), 'utf8').slice(symbol.startByte, symbol.endByte);
}

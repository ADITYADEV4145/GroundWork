import { readFileSync, statSync, type Stats } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import { loadConfig } from '../config/load.js';
import { adapterFor, languageForPath } from '../lang/index.js';
import { initParsersFor } from '../lang/parser.js';
import type { Language } from '../types.js';
import { loadTsPaths } from '../resolve/imports.js';
import { linkIndex, type LinkStats } from '../resolve/link.js';
import { readMeta, writeMeta } from '../store/schema.js';
import { sha1 } from '../util/hash.js';
import { log } from '../util/log.js';
import { hookTiming } from '../util/hook-timing.js';
import { discoverFiles, looksGenerated, makeTestMatcher } from './discover.js';
import { withWriteLock } from './lock.js';
import { openIndex } from './store.js';
import { deleteFile, upsertFile, writeExtraction, type FileMeta } from './write.js';

export interface RefreshResult {
  files: number;
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  skipped: number;
  partial: number;
  rebuilt: boolean;
  link: LinkStats | null;
  ms: number;
}

export interface RefreshOptions {
  config?: GroundworkConfig;
  /** Drop every row and re-parse everything. */
  full?: boolean;
  /** Limit the walk to these repo-relative paths (hook fast path). Others are left as they are. */
  paths?: string[];
  /** How long to wait for another writer before giving up (hooks pass a short budget). */
  lockTimeoutMs?: number;
}

/** Bring .groundwork/index.db up to date with the work tree; only new or changed files are re-parsed. */
export async function refreshIndex(root: string, opts: RefreshOptions = {}): Promise<RefreshResult> {
  const config = opts.config ?? loadConfig(root);
  const ready = new Set<Language>();
  let rebuiltForScope = false;
  let rebuiltDuringLoad = false;
  const refresh = () => withWriteLock(root, () => {
    const t0 = performance.now();
    const { db, rebuilt } = openIndex(root, config);
    hookTiming('indexOpenMs', performance.now() - t0);
    try {
      const isTest = makeTestMatcher(config);
      const existing = new Map<string, { id: number; hash: string; size: number; mtime: number; indexedAt: number }>();
      // Rebuilt and empty indexes still need every file, even when the hook supplies one path.
      const scope = opts.paths && !rebuilt && !opts.full && db.prepare('SELECT 1 FROM files LIMIT 1').get()
        ? new Set(opts.paths.map((p) => p.split(path.sep).join('/'))) : null;
      if (opts.paths && !scope) {
        rebuiltForScope = rebuilt;
        return null;
      }
      const scopedPaths = scope ? [...scope] : undefined;
      const placeholders = scopedPaths?.map(() => '?').join(',');
      for (const r of opts.full ? [] : db.prepare(`SELECT id, path, hash, size, mtime_ms, indexed_at FROM files${scope ? ` WHERE path IN (${placeholders})` : ''}`).all(...(scopedPaths ?? [])))
        existing.set(String(r.path), { id: Number(r.id), hash: String(r.hash), size: Number(r.size), mtime: Number(r.mtime_ms), indexedAt: Number(r.indexed_at) });

      const discoverStart = performance.now();
      const discovered = discoverFiles(root, config, scopedPaths);
      hookTiming('discoverMs', performance.now() - discoverStart);
      const res: RefreshResult = { files: discovered.length, added: 0, changed: 0, removed: 0, unchanged: 0, skipped: 0, partial: 0, rebuilt: rebuilt || rebuiltDuringLoad, link: null, ms: 0 };
      const now = Date.now();
      const discoveredSet = new Set(discovered);
      const changedIds: number[] = [];
      const changedNames = new Set<string>();
      const planned = new Map<string, { st: Stats; buf?: Buffer; hash?: string }>();
      const needed = new Set<Language>();
      for (const rel of discovered) {
        const prev = existing.get(rel);
        let st: Stats;
        try { st = statSync(path.join(root, rel)); } catch { continue; }
        if (prev && prev.size === st.size && prev.mtime === Math.floor(st.mtimeMs) && prev.indexedAt - prev.mtime > 2000) {
          planned.set(rel, { st });
          continue;
        }
        const buf = readFileSync(path.join(root, rel));
        const hash = sha1(buf);
        planned.set(rel, { st, buf, hash });
        const lang = languageForPath(rel);
        if (lang && prev?.hash !== hash && st.size <= config.index.maxFileBytes &&
          !(config.index.skipGenerated && looksGenerated(rel, buf.toString('utf8'))) && !ready.has(lang)) needed.add(lang);
      }
      if (needed.size) {
        rebuiltDuringLoad ||= rebuilt;
        return { languages: [...needed] };
      }

      db.transaction(() => {
        if (opts.full) db.exec('DELETE FROM symbols_fts; DELETE FROM export_aliases; DELETE FROM literals; DELETE FROM calls; DELETE FROM imports; DELETE FROM symbols; DELETE FROM files;');
        for (const [p, row] of existing) {
          if (discoveredSet.has(p) || (scope && !scope.has(p))) continue;
          deleteFile(db, row.id);
          res.removed++;
        }
        for (const rel of discovered) {
          if (scope && !scope.has(rel)) continue;
          const prev = existing.get(rel);
          const plan = planned.get(rel);
          if (!plan) continue;
          const { st, buf, hash } = plan;
          // Trust size+mtime only when the file was already old when we last read it (same idea as git's racy-clean check).
          if (!buf) {
            res.unchanged++;
            continue;
          }
          const lang = languageForPath(rel);
          if (prev && prev.hash === hash) {
            db.prepare('UPDATE files SET mtime_ms = ?, indexed_at = ? WHERE id = ?').run(Math.floor(st.mtimeMs), now, prev.id);
            res.unchanged++;
            continue;
          }
          const content = buf.toString('utf8');
          const meta: FileMeta = {
            path: rel,
            language: lang,
            hash: hash!,
            size: st.size,
            mtimeMs: st.mtimeMs,
            lines: content.length === 0 ? 0 : content.split('\n').length,
            isTest: isTest(rel),
            isGenerated: false,
            status: 'ok',
            skipReason: null,
          };
          let extraction = null;
          if (st.size > config.index.maxFileBytes) {
            meta.status = 'skipped';
            meta.skipReason = 'too-large';
          } else if (config.index.skipGenerated && looksGenerated(rel, content)) {
            meta.isGenerated = true;
            meta.status = 'skipped';
            meta.skipReason = 'generated';
          } else if (lang) {
            const extractStart = performance.now();
            try {
              extraction = adapterFor(lang).extract(content, lang);
              if (extraction.hasErrors) meta.status = 'partial';
            } catch (err) {
              meta.status = 'skipped';
              meta.skipReason = 'parse-failed';
              log(root, 'warn', 'parse_failed', { file: rel, error: (err as Error).message });
            }
            hookTiming('extractMs', performance.now() - extractStart);
          }
          const writeStart = performance.now();
          const linkSymbols = (id: number) => db.prepare('SELECT id, name, kind, parent_id, exported, is_default_export FROM symbols WHERE file_id = ?').all(id);
          const before = prev ? linkSymbols(prev.id) : [];
          const id = upsertFile(db, prev?.id ?? null, meta, now);
          changedIds.push(id);
          if (extraction) writeExtraction(db, id, rel, extraction);
          const after = linkSymbols(id);
          const oldSymbols = new Set(before.map((s) => JSON.stringify(s)));
          const newSymbols = new Set(after.map((s) => JSON.stringify(s)));
          for (const s of before) if (!newSymbols.has(JSON.stringify(s))) changedNames.add(String(s.name));
          for (const s of after) if (!oldSymbols.has(JSON.stringify(s))) changedNames.add(String(s.name));
          hookTiming('writeMs', performance.now() - writeStart);
          if (meta.status === 'skipped') res.skipped++;
          if (meta.status === 'partial') res.partial++;
          if (prev) res.changed++;
          else res.added++;
        }
        // Import resolution also depends on tsconfig/jsconfig paths, which are not indexed files.
        const resolverKey = sha1(JSON.stringify(loadTsPaths(root)));
        const resolverChanged = readMeta(db, 'resolver_key') !== resolverKey;
        if (res.added || res.changed || res.removed || rebuilt || opts.full || resolverChanged)
          res.link = linkIndex(db, root, !res.added && !res.removed && !rebuilt && !opts.full && !resolverChanged
            ? { files: changedIds, names: [...changedNames] } : undefined);
        if (res.link) hookTiming('linkMs', res.link.ms);
        if (resolverChanged) writeMeta(db, 'resolver_key', resolverKey);
        if (res.added || res.changed || res.removed || rebuilt || opts.full || resolverChanged || !readMeta(db, 'generation'))
          writeMeta(db, 'generation', randomUUID());
        writeMeta(db, 'last_refresh', String(now));
      });
      res.ms = Math.round(performance.now() - t0);
      return res;
    } finally {
      db.close();
    }
  }, opts.lockTimeoutMs);
  for (;;) {
    const result = refresh();
    if (result && 'languages' in result) {
      const parserStart = performance.now();
      await initParsersFor(result.languages);
      hookTiming('parserInitMs', performance.now() - parserStart);
      for (const lang of result.languages) ready.add(lang);
      continue;
    }
    if (result) return result;
    const full = await refreshIndex(root, { ...opts, paths: undefined });
    full.rebuilt ||= rebuiltForScope;
    return full;
  }
}

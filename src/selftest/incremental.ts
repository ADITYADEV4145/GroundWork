import { rmSync } from 'node:fs';
import { refreshIndex } from '../index/refresh.js';
import { indexDbPath } from '../index/store.js';
import { initSqlBackend, openDb } from '../store/db.js';
import { canonicalDump } from './dump.js';
import { tempDir } from './fixtures.js';
import { copyDir, prng, randomEdit, synthRepo, type EditOp } from './synth.js';

function dumpOf(dir: string): string {
  const db = openDb(indexDbPath(dir), { readonly: true });
  try {
    return canonicalDump(db);
  } finally {
    db.close();
  }
}

/**
 * Apply edits one at a time with an incremental refresh after each, then check the result equals a
 * from-scratch index of the same tree. Returns null on success, or the edit log on mismatch.
 */
export async function incrementalMatchesFull(seed: number, ops: (EditOp | null)[], lines = 400): Promise<string | null> {
  await initSqlBackend();
  const work = tempDir('gw-inc-');
  const fresh = tempDir('gw-full-');
  try {
    synthRepo(work, lines, seed);
    await refreshIndex(work);
    const rnd = prng(seed * 7919 + 1);
    const log: string[] = [];
    for (const op of ops) {
      log.push(randomEdit(work, rnd, op ?? undefined));
      await refreshIndex(work);
    }
    copyDir(work, fresh);
    await refreshIndex(fresh);
    return dumpOf(work) === dumpOf(fresh) ? null : `seed ${seed}: ${log.join('; ')}`;
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(fresh, { recursive: true, force: true });
  }
}

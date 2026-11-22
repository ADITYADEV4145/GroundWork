import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import { indexGeneration } from '../index/query.js';
import type { Db } from '../store/db.js';
import { CandidateIndex, prepareCandidateParsers } from './candidates.js';

const cache = new Map<string, { key: string; index: CandidateIndex }>();
const MAX_ROOTS = 8;

export async function cachedCandidates(db: Db, root: string, config: GroundworkConfig): Promise<CandidateIndex> {
  const generation = indexGeneration(db);
  if (!generation) {
    await prepareCandidateParsers(db);
    return new CandidateIndex(db, config.reuse.skipTests);
  }
  const id = path.resolve(root);
  const key = JSON.stringify([generation, config]);
  const previous = cache.get(id);
  if (previous?.key === key) return previous.index;
  await prepareCandidateParsers(db);
  const index = new CandidateIndex(db, config.reuse.skipTests);
  cache.delete(id);
  cache.set(id, { key, index });
  if (cache.size > MAX_ROOTS) cache.delete(cache.keys().next().value!);
  return index;
}

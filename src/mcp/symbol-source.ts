import { sourceLocation, type NavigationSymbol } from '../index/navigation.js';
import { sha1 } from '../util/hash.js';
import { readRepoFile } from '../util/repo-file.js';
import type { ToolContext } from './registry.js';

export function indexedSource(ctx: ToolContext, symbol: NavigationSymbol) {
  const loc = sourceLocation(ctx.db, symbol.id);
  if (!loc) return null;
  try {
    const raw = readRepoFile(ctx.root, symbol.file, ctx.config.index.maxFileBytes);
    if (raw && sha1(raw) === loc.hash) return { ...loc, source: raw.toString('utf8') };
  } catch { /* Source may have disappeared since indexing. */ }
  return null;
}

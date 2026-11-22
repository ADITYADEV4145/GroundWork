import type { GroundworkConfig } from '../config/schema.js';
import { fileOutline, findCode, mapFiles, sourceLocation } from '../index/navigation.js';
import { indexDbPath } from '../index/store.js';
import { readSource } from '../mcp/tools/navigation.js';
import { initSqlBackend, openDb } from '../store/db.js';
import { sha1 } from '../util/hash.js';
import { readRepoFile } from '../util/repo-file.js';
import { estimateTokens, fitToBudget } from '../util/tokens.js';

const short = (value: string, length: number) => [...value.replace(/[\u0000-\u001f\u007f]/g, ' ')].slice(0, length).join('');

export async function largeReadContext(root: string, file: string, raw: Buffer, config: GroundworkConfig, query?: string): Promise<string | null> {
  try {
    await initSqlBackend();
    const db = openDb(indexDbPath(root), { readonly: true });
    try {
      const outline = fileOutline(db, file);
      if (!outline || outline.status !== 'ok' || !outline.symbols.length) return null;
      const hash = sha1(raw);
      if (sourceLocation(db, outline.symbols[0]!.id)?.hash !== hash) return null;
      const ranked = query ? findCode(db, query, undefined, file).filter((s) => s.score > 0) : [];
      const names = mapFiles(db, file)[0]?.symbols ?? [];
      const preferred = ranked.length ? ranked : names.flatMap((name) => outline.symbols.filter((s) => s.name === name));
      const selected = (preferred.length ? preferred : outline.symbols).slice(0, raw.length >= 4096 ? 2 : 1);
      const header = `Compact indexed context for ${file} (${raw.length} bytes), not the full file. Repeat the exact Read to get the full file. Use read_symbol for missing bodies/ranges.\n`;
      const { items } = fitToBudget(outline.symbols, (s) => `${short(s.name, 35)}:${s.line}-${s.endLine} [${s.id}]`, 75, 15);
      const listing = `Outline (${items.length}/${outline.symbols.length} symbols):\n` + items.map((s) => `${short(s.name, 35)}:${s.line}-${s.endLine} [${s.id}]`).join('\n') + '\nSelected bodies (ranked leads, not complete file context):\n';
      const maxBytes = Math.min(3600, Math.floor(raw.length * 0.65));
      const budget = Math.floor((maxBytes - Buffer.byteLength(header + listing) - 8) / (4 * selected.length));
      if (budget < 100) return null;
      const bodies = selected.map((s) => readSource({ symbol: s.id, context_lines: 0, offset: 0 }, { root, db, config }, budget, true));
      if (bodies.some((body, i) => !body.startsWith(`[${selected[i]!.id}]`) || !body.slice(body.indexOf('\n') + 1).trim() || body.slice(body.indexOf('\n') + 1).trimStart().startsWith('…'))) return null;
      const message = header + listing + bodies.join('\n');
      if (Buffer.byteLength(message) > maxBytes || estimateTokens(message) > 900) return null;
      const current = readRepoFile(root, file, config.index.maxFileBytes);
      return current && sha1(current) === hash ? message : null;
    } finally { db.close(); }
  } catch { return null; }
}

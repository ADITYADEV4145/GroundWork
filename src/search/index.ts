import type { GroundworkConfig } from '../config/schema.js';
import { loadConfig } from '../config/load.js';
import { findCode } from '../index/navigation.js';
import { searchDocuments } from '../index/query.js';
import { DEFAULT_EMBEDDING_MODEL, embedSources, hasLocalEmbeddings } from '../reuse/embeddings.js';
import { vectorCosine } from '../reuse/signals.js';
import type { Db } from '../store/db.js';
import { sha1 } from '../util/hash.js';
import { readRepoFile } from '../util/repo-file.js';
import { alternatives, reciprocalRankFusion, terms } from './terms.js';

export interface CodeSearchOptions {
  limit?: number;
  semantic?: boolean;
  root?: string;
  config?: GroundworkConfig;
}
export type CodeSearchHit = Pick<ReturnType<typeof searchDocuments>[number], 'id' | 'name' | 'kind' | 'file' | 'line' | 'endLine' | 'signature' | 'doc'> & {
  score: number; stages: ('lexical' | 'semantic')[]; reason: string;
};

export async function searchCode(db: Db, query: string, opts: CodeSearchOptions = {}): Promise<CodeSearchHit[]> {
  const limit = opts.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer from 1 to 100');
  if (query.length > 2048) throw new Error('query must be at most 2048 characters');
  const q = query.trim();
  const words = terms(q).slice(0, 24);
  if (!words.length) return [];
  const docs = searchDocuments(db);
  const originals = findCode(db, q);
  const exact = originals.filter((s) => s.name.toLowerCase() === q.toLowerCase() || s.name.split('.').at(-1)?.toLowerCase() === q.toLowerCase());
  const prior = new Map(originals.map((s) => [s.id, s.score]));
  const fields = docs.map((d) => [d.name, d.qualifiedName, d.doc, d.signature, d.file, d.body].map((f) => new Set(terms(f, false))));
  const idf = new Map(words.map((w) => [w, Math.log(1 + docs.length / (1 + fields.filter((fs) => fs.some((f) => alternatives(w).some((a) => f.has(a)))).length))]));
  const reasons = new Map<string, string>();
  const lexical = docs.map((d, i) => {
    const matched: string[] = [];
    let score = (prior.get(d.id) ?? 0) / 20;
    for (const w of words) {
      let best = 0;
      for (const [j, field] of fields[i]!.entries()) {
        const weight = [8, 6, 4, 3, 2, 1][j]!;
        if (field.has(w)) best = Math.max(best, weight);
        else if (alternatives(w).some((a) => field.has(a))) best = Math.max(best, weight * 0.65);
      }
      if (best) { matched.push(w); score += best * idf.get(w)!; }
    }
    score *= 0.5 + matched.length / words.length;
    reasons.set(d.id, matched.length ? `terms: ${matched.join(', ')}` : 'find_code match');
    return { id: d.id, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  let ranked = lexical;
  const semanticIds = new Set<string>();
  if (opts.semantic !== false && opts.root) {
    const root = opts.root;
    const config = opts.config ?? loadConfig(root);
    const model = config.reuse.embeddings.model ?? DEFAULT_EMBEDDING_MODEL;
    if (hasLocalEmbeddings(root, model)) {
      const files = new Map<string, string | null>();
      const sources = docs.flatMap((d) => {
        if (!files.has(d.file)) {
          try {
            const raw = readRepoFile(root, d.file, config.index.maxFileBytes);
            files.set(d.file, raw && sha1(raw) === d.hash ? raw.toString('utf8') : null);
          } catch { files.set(d.file, null); }
        }
        const text = files.get(d.file);
        return text ? [{ id: d.id, text: text.slice(d.start, d.end) }] : [];
      });
      const enabled = { ...config, reuse: { ...config.reuse, embeddings: { ...config.reuse.embeddings, enabled: true } } };
      const vectors = await embedSources(root, enabled, [{ id: ':query', text: q }, ...sources]);
      const queryVector = vectors.get(':query');
      if (queryVector) {
        const semantic = docs.flatMap((d) => {
          const v = vectors.get(d.id);
          return v ? [{ id: d.id, score: vectorCosine(queryVector.vector, v.vector) }] : [];
        }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 100);
        for (const s of semantic) semanticIds.add(s.id);
        ranked = reciprocalRankFusion([lexical.map((s) => s.id), semantic.map((s) => s.id)]);
      }
    }
  }
  const lexicalIds = new Set(lexical.map((s) => s.id));
  const exactIds = new Set(exact.map((s) => s.id));
  const order = [...exact.map((s) => ({ id: s.id, score: s.score })), ...ranked.filter((s) => !exactIds.has(s.id))];
  const byId = new Map(docs.map((d) => [d.id, d]));
  return order.slice(0, limit).map(({ id, score }) => {
    const d = byId.get(id)!;
    return { id, name: d.qualifiedName, kind: d.kind, file: d.file, line: d.line, endLine: d.endLine,
      signature: d.signature, doc: d.doc.split(/\r?\n/)[0] ?? '', score,
      stages: [...(lexicalIds.has(id) || exactIds.has(id) ? ['lexical' as const] : []), ...(semanticIds.has(id) ? ['semantic' as const] : [])],
      reason: exactIds.has(id) ? 'exact name' : lexicalIds.has(id) ? reasons.get(id)! : 'semantic similarity' };
  });
}

const compact = (s: string, n: number) => [...s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ')].slice(0, n).join('');
export const renderSearchHit = (h: CodeSearchHit): string =>
  `[${h.id}] ${compact(h.name, 80)} (${h.kind}) ${compact(h.file, 180)}:${h.line} — ${compact(h.doc, 140)} · ${h.stages.join('+')}: ${compact(h.reason, 140)}`;

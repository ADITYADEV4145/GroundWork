import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readFingerprintedSymbols, type FingerprintedSymbol } from '../index/query.js';
import { languageForPath } from '../lang/index.js';
import type { Db } from '../store/db.js';
import type { GroundworkConfig } from '../config/schema.js';
import type { Embedding, EmbedderFactory } from './embeddings.js';
import { meaningModel } from './model.js';
import { buildIdf, vectorCosine, wordsOf, type ComparableSymbol } from './signals.js';
import { extractReuseSource } from './source.js';
import { relatedSymbols, type PairIdentity } from './policy.js';

function bands(s: ComparableSymbol): string[] {
  const hash = s.fingerprint?.minhash;
  if (!hash) return [];
  return Array.from({ length: 16 }, (_, i) => `${i}:${hash.slice(i * 8, i * 8 + 8).join(',')}`);
}

type Candidate = FingerprintedSymbol & { bindingHash?: string | null; embedding?: Embedding };
export class CandidateIndex {
  readonly symbols: Candidate[];
  readonly idf: Map<string, number>;
  private readonly lsh = new Map<string, Set<Candidate>>();
  private readonly vocab = new Map<string, Set<Candidate>>();
  private meaningContext?: { root: string; config: GroundworkConfig; factory?: EmbedderFactory };

  constructor(db: Db, skipTests = true) {
    const files = new Map<string, Map<string, string | null>>();
    const all = readFingerprintedSymbols(db).map((symbol) => {
      if (!files.has(symbol.file)) {
        const hashes = new Map<string, string | null>();
        const language = languageForPath(symbol.file);
        if (language && path.isAbsolute(db.path)) {
          try {
            const source = readFileSync(path.join(path.dirname(path.dirname(db.path)), symbol.file), 'utf8');
            for (const s of extractReuseSource(source, language).symbols) hashes.set(s.qualifiedName, s.bindingHash);
          } catch { /* Missing source leaves the optional signal unavailable. */ }
        }
        files.set(symbol.file, hashes);
      }
      return { ...symbol, bindingHash: files.get(symbol.file)!.get(symbol.qualifiedName) ?? null };
    });
    this.idf = buildIdf(all);
    this.symbols = all.filter((s) => !(skipTests && s.isTest) && !s.isGenerated &&
      !/^__.*__$/.test(s.name) && s.fingerprint.tokenCount >= 15 && !/^(get|set)\s/.test(s.signature));
    for (const s of this.symbols) {
      for (const key of bands(s)) {
        if (!this.lsh.has(key)) this.lsh.set(key, new Set());
        this.lsh.get(key)!.add(s);
      }
      for (const w of Object.keys(wordsOf(s))) {
        if (!this.vocab.has(w)) this.vocab.set(w, new Set());
        this.vocab.get(w)!.add(s);
      }
    }
  }

  async prepareMeaning(root: string, config: GroundworkConfig, factory?: EmbedderFactory, options: { deadline?: number } = {}): Promise<void> {
    if (!config.reuse.embeddings.enabled) return;
    const { DEFAULT_EMBEDDING_MODEL, embedSources, warnMeaning } = await import('./embeddings.js');
    this.meaningContext = { root, config, factory };
    const sources = this.symbols.flatMap((s) => {
      if (Date.now() >= (options.deadline ?? Infinity)) return [];
      try { return [{ id: s.id, text: readFileSync(path.join(root, s.file), 'utf8').slice(s.startByte, s.endByte) }]; }
      catch { return []; }
    });
    const vectors = await embedSources(root, config, sources, factory, options);
    for (const symbol of this.symbols) symbol.embedding = vectors.get(symbol.id);
    const model = config.reuse.embeddings.model ?? DEFAULT_EMBEDDING_MODEL;
    if (vectors.size && model !== meaningModel.embeddingModel)
      warnMeaning(root, model, 'This model has no calibrated classifier; only baseline scoring is used.');
  }

  async embedQuery(text: string): Promise<Embedding | undefined> {
    const ctx = this.meaningContext;
    if (!ctx) return undefined;
    const { embedSources } = await import('./embeddings.js');
    return (await embedSources(ctx.root, ctx.config, [{ id: 'query', text }], ctx.factory)).get('query');
  }

  find(query: ComparableSymbol & PairIdentity & { id?: string }, limit = 80): Candidate[] {
    const found = new Set<Candidate>();
    for (const key of bands(query)) for (const s of this.lsh.get(key) ?? []) found.add(s);
    const counts = new Map<Candidate, number>();
    for (const w of Object.keys(wordsOf(query))) for (const s of this.vocab.get(w) ?? []) counts.set(s, (counts.get(s) ?? 0) + (this.idf.get(w) ?? 1));
    for (const [s] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit)) found.add(s);
    if (query.embedding) {
      const embedding = query.embedding;
      const semantic = this.symbols.filter((s) => s.embedding?.model === embedding.model)
        .map((s) => ({ s, cosine: vectorCosine(embedding.vector, s.embedding!.vector) }))
        .sort((a, b) => b.cosine - a.cosine).slice(0, limit);
      for (const { s } of semantic) found.add(s);
    }
    return [...found].filter((s) => s.id !== query.id && !relatedSymbols(query, s));
  }
}

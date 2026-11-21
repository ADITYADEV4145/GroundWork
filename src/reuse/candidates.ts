import { readFingerprintedSymbols, type FingerprintedSymbol } from '../index/query.js';
import type { Db } from '../store/db.js';
import { buildIdf, wordsOf, type ComparableSymbol } from './signals.js';

function bands(s: ComparableSymbol): string[] {
  const hash = s.fingerprint?.minhash;
  if (!hash) return [];
  return Array.from({ length: 16 }, (_, i) => `${i}:${hash.slice(i * 8, i * 8 + 8).join(',')}`);
}

export class CandidateIndex {
  readonly symbols: FingerprintedSymbol[];
  readonly idf: Map<string, number>;
  private readonly lsh = new Map<string, Set<FingerprintedSymbol>>();
  private readonly vocab = new Map<string, Set<FingerprintedSymbol>>();

  constructor(db: Db, skipTests = true) {
    const all = readFingerprintedSymbols(db);
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

  find(query: ComparableSymbol & { id?: string; file?: string }, limit = 80): FingerprintedSymbol[] {
    const found = new Set<FingerprintedSymbol>();
    for (const key of bands(query)) for (const s of this.lsh.get(key) ?? []) found.add(s);
    const counts = new Map<FingerprintedSymbol, number>();
    for (const w of Object.keys(wordsOf(query))) for (const s of this.vocab.get(w) ?? []) counts.set(s, (counts.get(s) ?? 0) + (this.idf.get(w) ?? 1));
    for (const [s] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit)) found.add(s);
    return [...found].filter((s) => s.id !== query.id && !(s.file === query.file && s.name === query.name));
  }
}

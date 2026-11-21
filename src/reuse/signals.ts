import { minhashSimilarity, splitWords, vocabulary } from '../extract/fingerprint.js';
import type { BodyFingerprint, Param } from '../types.js';

export interface ComparableSymbol {
  name: string;
  fingerprint: BodyFingerprint | null;
  docstring: string | null;
  params: Param[] | null;
  returnType: string | null;
  bindingHash?: string | null;
}

export interface Signals {
  structure: number;
  exact: number;
  vocabulary: number;
  paramCount: number;
  paramNames: number;
  returnType: number;
  name: number;
  bindingExact: number;
  structureVocabulary: number;
  exactVocabulary: number;
}

export interface OptionalSignal {
  name: string;
  compare(a: ComparableSymbol, b: ComparableSymbol): number;
}

export function wordsOf(s: ComparableSymbol): Record<string, number> {
  const bag = { ...s.fingerprint?.vocab };
  for (const [word, count] of Object.entries(vocabulary([s.docstring ?? '']))) bag[word] = (bag[word] ?? 0) + count;
  return bag;
}

export function buildIdf(symbols: ComparableSymbol[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of symbols) for (const w of Object.keys(wordsOf(s))) counts.set(w, (counts.get(w) ?? 0) + 1);
  return new Map([...counts].map(([w, n]) => [w, Math.log((symbols.length + 1) / (n + 1)) + 1]));
}

function overlap(a: string[], b: string[]): number {
  const x = new Set(a), y = new Set(b);
  const common = [...x].filter((w) => y.has(w)).length;
  return x.size + y.size ? common / (x.size + y.size - common) : 0;
}

export function pairSignals(a: ComparableSymbol, b: ComparableSymbol, idf: Map<string, number>): Signals {
  const x = wordsOf(a), y = wordsOf(b);
  let dot = 0, nx = 0, ny = 0;
  for (const w of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const weight = idf.get(w) ?? 1;
    const vx = Math.log1p(x[w] ?? 0) * weight, vy = Math.log1p(y[w] ?? 0) * weight;
    dot += vx * vy; nx += vx * vx; ny += vy * vy;
  }
  const structure = a.fingerprint && b.fingerprint ? minhashSimilarity(a.fingerprint.minhash, b.fingerprint.minhash) : 0;
  const exact = a.fingerprint && b.fingerprint && a.fingerprint.normHash === b.fingerprint.normHash ? 1 : 0;
  const cosine = nx && ny ? Math.min(1, dot / Math.sqrt(nx * ny)) : 0;
  return {
    structure, exact, vocabulary: cosine,
    bindingExact: a.fingerprint && b.fingerprint && a.bindingHash && b.bindingHash && a.bindingHash === b.bindingHash ? 1 : 0,
    structureVocabulary: structure * cosine,
    exactVocabulary: exact * cosine,
    paramCount: a.params && b.params ? 1 - Math.abs(a.params.length - b.params.length) / Math.max(1, a.params.length, b.params.length) : 0,
    paramNames: overlap((a.params ?? []).flatMap((p) => splitWords(p.name)), (b.params ?? []).flatMap((p) => splitWords(p.name))),
    returnType: a.returnType && b.returnType && a.returnType.replace(/\s/g, '') === b.returnType.replace(/\s/g, '') ? 1 : 0,
    name: overlap(splitWords(a.name), splitWords(b.name)),
  };
}

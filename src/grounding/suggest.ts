import { splitWords } from '../extract/fingerprint.js';
import type { SymbolFact } from '../index/query.js';

// "Did you mean": rank real symbols by name similarity, shared identifier words and locality, so the agent
// can fix a call without another search. Includes the signature so no extra read is needed.

export interface Suggestion {
  name: string;
  qualifiedName: string;
  file: string;
  line: number;
  signature: string;
  score: number;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

const FILLER = new Set(['by', 'get', 'set', 'to', 'of', 'the', 'a', 'an', 'is', 'do', 'for', 'from', 'with', 'and', 'or', 'in', 'on']);

/** 0..1 similarity between a missing name and a candidate symbol name. */
export function nameSimilarity(missing: string, candidate: string): number {
  const a = missing.toLowerCase();
  const b = candidate.toLowerCase();
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  const wa = new Set(splitWords(missing).filter((w) => !FILLER.has(w)));
  const wb = new Set(splitWords(candidate).filter((w) => !FILLER.has(w)));
  const shared = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  const words = union ? shared / union : 0;
  return Math.max(edit, 0.45 * edit + 0.55 * words + (shared > 0 ? 0.1 : 0));
}

export interface SuggestOptions {
  /** Symbols in the place the agent pointed at (the module or class) rank first. */
  near?: SymbolFact[];
  pool?: SymbolFact[];
  limit?: number;
}

export function suggest(missing: string, opts: SuggestOptions): Suggestion[] {
  const limit = opts.limit ?? 3;
  const scored = new Map<string, Suggestion>();
  const add = (s: SymbolFact, bonus: number) => {
    if (s.name === missing || s.name === 'default' || s.name.startsWith('__')) return;
    const score = nameSimilarity(missing, s.name) + bonus;
    if (score < 0.55 + bonus) return;
    const prev = scored.get(s.id);
    if (prev && prev.score >= score) return;
    scored.set(s.id, { name: s.name, qualifiedName: s.qualifiedName, file: s.file, line: s.line, signature: s.signature, score: Math.round(score * 100) / 100 });
  };
  for (const s of opts.near ?? []) add(s, 0.15);
  for (const s of opts.pool ?? []) add(s, s.exported ? 0.02 : 0);
  return [...scored.values()].sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line).slice(0, limit);
}

export function renderSuggestions(s: Suggestion[]): string {
  if (!s.length) return '';
  return ` Did you mean ${s.map((x) => `${x.qualifiedName} (${x.file}:${x.line}, ${x.signature})`).join(' or ')}?`;
}

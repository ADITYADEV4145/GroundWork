import type { Node } from 'web-tree-sitter';
import type { BodyFingerprint } from '../types.js';
import { fnv1a, sha1 } from '../util/hash.js';

// Body fingerprints feed the Phase 3 duplicate gate: a normalized token stream (identifiers and literals
// abstracted) for structure, and an identifier-word bag for vocabulary.

export const MINHASH_PERMS = 128;
export const SHINGLE_K = 4;

const IDENT_TYPES = new Set([
  'identifier',
  'property_identifier',
  'shorthand_property_identifier',
  'shorthand_property_identifier_pattern',
  'type_identifier',
  'private_property_identifier',
  'field_identifier',
  'statement_identifier',
]);
const STRING_TYPES = new Set(['string', 'template_string', 'string_fragment', 'string_content', 'concatenated_string']);
const NUMBER_TYPES = new Set(['number', 'integer', 'float']);
const SKIP_TYPES = new Set(['comment', 'decorator']);

export interface TokenStream {
  norm: string[];
  identifiers: string[];
}

/** Leaf tokens of a node with identifiers -> ID, strings -> STR, numbers -> NUM. Comments dropped. */
export function normalizedTokens(node: Node): TokenStream {
  const norm: string[] = [];
  const identifiers: string[] = [];
  const cursor = node.walk();
  try {
    for (;;) {
      const type = cursor.nodeType;
      if (SKIP_TYPES.has(type)) {
        // Skip the subtree.
      } else if (STRING_TYPES.has(type)) norm.push('STR');
      else if (NUMBER_TYPES.has(type)) norm.push('NUM');
      else if (IDENT_TYPES.has(type)) {
        norm.push('ID');
        identifiers.push(cursor.nodeText);
      } else if (cursor.gotoFirstChild()) continue;
      else {
        const t = cursor.nodeText.trim();
        if (t) norm.push(t);
      }
      while (!cursor.gotoNextSibling()) if (!cursor.gotoParent()) return { norm, identifiers };
    }
  } finally { cursor.delete(); }
}

function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const SEEDS = Array.from({ length: MINHASH_PERMS }, (_, i) => mix32((i + 1) * 0x9e3779b1));
const minhashCache = new Map<string, Uint32Array>();

export function minhash(tokens: string[], k = SHINGLE_K): Uint32Array {
  const key = JSON.stringify([k, tokens]);
  const cached = minhashCache.get(key);
  if (cached) return cached.slice();
  const sig = new Uint32Array(MINHASH_PERMS).fill(0xffffffff);
  const n = Math.max(1, tokens.length - k + 1);
  for (let i = 0; i < n; i++) {
    const h = fnv1a(tokens.slice(i, i + k).join('\u0001'));
    for (let p = 0; p < MINHASH_PERMS; p++) {
      const v = mix32(h ^ SEEDS[p]!);
      if (v < sig[p]!) sig[p] = v;
    }
  }
  if (minhashCache.size >= 256) minhashCache.delete(minhashCache.keys().next().value!);
  minhashCache.set(key, sig.slice());
  return sig;
}

export function minhashSimilarity(a: Uint32Array, b: Uint32Array): number {
  let same = 0;
  for (let i = 0; i < MINHASH_PERMS; i++) if (a[i] === b[i]) same++;
  return same / MINHASH_PERMS;
}

/** Split camelCase / PascalCase / snake_case / kebab and digits into lowercase words. */
export function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+|(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
}

/** Tiny suffix stemmer: enough to merge get/gets/getting, user/users, parse/parsed/parser. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  for (const suf of ['ations', 'ation', 'ings', 'ing', 'ers', 'ies', 'ied', 'er', 'ed', 'es', 'ly', 's']) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      const base = word.slice(0, -suf.length);
      if (suf === 'ies' || suf === 'ied') return base + 'y';
      return base;
    }
  }
  return word;
}

export function vocabulary(words: Iterable<string>): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const raw of words) for (const w of splitWords(raw)) {
    const s = stem(w);
    bag[s] = (bag[s] ?? 0) + 1;
  }
  return bag;
}

export function fingerprint(body: Node, extraWords: string[] = []): BodyFingerprint {
  const { norm, identifiers } = normalizedTokens(body);
  return {
    tokenCount: norm.length,
    bodyHash: sha1(body.text),
    minhash: minhash(norm),
    normHash: sha1(norm.join(' ')),
    vocab: vocabulary([...identifiers, ...extraWords]),
  };
}

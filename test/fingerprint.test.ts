import { beforeAll, describe, expect, it } from 'vitest';
import { fingerprint, minhash, minhashSimilarity, normalizedTokens, splitWords, stem } from '../src/extract/fingerprint.js';
import { initParsers, parse } from '../src/lang/parser.js';

const body = (src: string) => {
  const t = parse('typescript', src);
  const fn = t.rootNode.descendantsOfType('function_declaration')[0]!;
  return fingerprint(fn.childForFieldName('body')!, [fn.childForFieldName('name')!.text]);
};

describe('fingerprints', () => {
  beforeAll(() => initParsers());

  it('splits and stems identifier words', () => {
    expect(splitWords('parseHTTPResponse_v2')).toEqual(['parse', 'http', 'response', 'v', '2']);
    expect(splitWords('user_ids')).toEqual(['user', 'ids']);
    expect(stem('users')).toBe('user');
    expect(stem('parsing')).toBe('pars');
  });

  it('preserves token order while skipping comment and literal subtrees', () => {
    const tree = parse('typescript', 'function f() { /* ignored */ const value = `hello ${other}`; return value + 10; }');
    try {
      const block = tree.rootNode.descendantsOfType('statement_block')[0]!;
      expect(normalizedTokens(block)).toEqual({
        norm: ['{', 'const', 'ID', '=', 'STR', ';', 'return', 'ID', '+', 'NUM', ';', '}'],
        identifiers: ['value', 'value'],
      });
    } finally { tree.delete(); }
  });

  it('keeps cached signatures independent of callers and shingle sizes', () => {
    const tokens = ['ID', '=', 'NUM', '+', 'ID'];
    const expected = minhash(tokens);
    const first = minhash(tokens);
    first.fill(0);
    expect(minhash(tokens)).toEqual(expected);
    expect(minhash(tokens, 2)).not.toEqual(expected);
    expect(minhash([])).toEqual(minhash([]));
  });

  it('renamed clones share a normalized hash; unrelated code does not', () => {
    const a = body('function sumAll(xs: number[]) { let t = 0; for (const x of xs) t += x; return t; }');
    const b = body('function total(values: number[]) { let acc = 0; for (const v of values) acc += v; return acc; }');
    const c = body('function greet(name: string) { console.log("hi " + name); return name.length > 3; }');
    expect(a.normHash).toBe(b.normHash);
    expect(minhashSimilarity(a.minhash, b.minhash)).toBe(1);
    expect(minhashSimilarity(a.minhash, c.minhash)).toBeLessThan(0.3);
    expect(a.vocab.sum).toBe(1);
  });
});

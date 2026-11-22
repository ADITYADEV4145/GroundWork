import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import { readFingerprintedSymbols } from '../src/index/query.js';
import { findSimilarTool } from '../src/mcp/tools/find_similar.js';
import { TOOLS } from '../src/mcp/tools/index.js';
import { CandidateIndex } from '../src/reuse/candidates.js';
import { model, probability } from '../src/reuse/model.js';
import { findSimilar, renderSimilar } from '../src/reuse/similar.js';
import { buildIdf, pairSignals, type ComparableSymbol, type Signals } from '../src/reuse/signals.js';
import { withIndexedFixture } from '../src/selftest/fixtures.js';
import { estimateTokens } from '../src/util/tokens.js';

const description = 'parse a date string into a Date';
const MAIN = path.resolve(__dirname, '../src/cli/main.ts');
const TSX = import.meta.resolve('tsx');

describe('reuse signals and candidates', () => {
  it('scores renamed clones structurally, while vocabulary distinguishes hard negatives', async () => {
    await withIndexedFixture('reuse-app', (db) => {
      const all = readFingerprintedSymbols(db);
      const get = (name: string) => all.find((s) => s.name === name)!;
      const idf = buildIdf(all);
      const a = get('parseDateString');
      const clone = pairSignals(a, get('decodeTimestamp'), idf);
      expect(clone.exact).toBe(1);
      expect(clone.structure).toBe(1);
      expect(clone.paramCount).toBe(1);
      const semantic = pairSignals(a, get('dateFromParts'), idf);
      const negative = pairSignals(a, get('countValidOrders'), idf);
      expect(semantic.vocabulary).toBeGreaterThan(negative.vocabulary);
      expect(probability(clone)).toBeGreaterThan(probability(negative));
      for (const s of all) for (const value of Object.values(pairSignals(a, s, idf))) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(model.status).toBe('calibrated-grouped-oof');
      const candidates = new CandidateIndex(db);
      expect(candidates.symbols.every((s) => typeof s.bindingHash === 'string')).toBe(true);
      expect(candidates.find(a).map((s) => s.name)).toContain('decodeTimestamp');
      expect(candidates.find(a).map((s) => s.name)).not.toContain(a.name);
      expect(candidates.symbols.map((s) => s.name)).not.toEqual(expect.arrayContaining(['tiny', '__repr__', 'testOnlyDateParser', 'generatedDateParser']));
      expect(candidates.symbols.some((s) => s.isTest || s.isGenerated || s.fingerprint.tokenCount < 15 || s.name === '__repr__')).toBe(false);
      expect(new CandidateIndex(db, false).symbols.some((s) => s.name === 'testOnlyDateParser')).toBe(true);
      expect(pairSignals(get('parse_date_string'), get('read_calendar'), idf).exact).toBe(1);
    });
  });

  it('handles absent signals without treating missing data as a match', () => {
    const empty: ComparableSymbol = { name: '', fingerprint: null, docstring: null, params: null, returnType: null };
    const signals = pairSignals(empty, empty, buildIdf([]));
    expect(Object.values(signals).every((value) => value === 0)).toBe(true);
    expect(probability(signals)).toBeCloseTo(1 / (1 + Math.exp(-model.intercept)));
    const high = Object.fromEntries(Object.keys(signals).map((k) => [k, 1])) as unknown as Signals;
    expect(probability(high)).toBeGreaterThan(probability(signals));
  });
});

describe('find_similar', () => {
  it('ranks date parsing above unrelated work and budgets both output formats', async () => {
    await withIndexedFixture('reuse-app', async (db, root) => {
      const index = new CandidateIndex(db);
      const result = await findSimilar(index, { description, detail: 'full' });
      expect(['parseDateString', 'dateFromParts', 'parse_date_string', 'read_calendar']).toContain(result.matches[0]?.symbol);
      expect(result.matches.every((m) => m.symbol !== 'countValidOrders')).toBe(true);
      expect(renderSimilar(result)).not.toContain('State REUSE');
      expect(estimateTokens(renderSimilar(result))).toBeLessThanOrEqual(500);
      expect(estimateTokens(JSON.stringify(result))).toBeLessThanOrEqual(500);
      const draft = 'function another(value: string): Date { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new Error("Invalid"); return date; }';
      const code = await findSimilar(index, { description, code: draft });
      expect(code.matches.every((m) => m.verdict !== 'related')).toBe(true);
      const fullCode = await findSimilar(index, { description, code: draft, detail: 'full' });
      expect(code.matches).toEqual(fullCode.matches.filter((m) => m.verdict !== 'related'));
      expect(['parseDateString', 'decodeTimestamp']).toContain(code.matches[0]?.symbol);
      expect(code.matches[0]?.why).toContain('structure');
      const signature = await findSimilar(index, { description, signature: 'parse(value: string): Date', detail: 'full' });
      expect(signature.matches.length).toBeGreaterThan(0);
      const python = await findSimilar(index, { description, language: 'python', signature: 'parse(value: str) -> datetime:', detail: 'full' });
      expect(python.matches.length).toBeGreaterThan(0);
      expect(TOOLS.some((t) => t.name === 'find_similar')).toBe(true);
      const text = await findSimilarTool.handler({ description, language: 'typescript', detail: 'full' }, { root, db, config: configSchema.parse({}) });
      expect(text).toBe(renderSimilar(result));
      const cli = JSON.parse(execFileSync(process.execPath, ['--import', TSX, MAIN, '--root', root, 'similar', description, '--detail', 'full', '--json'], { encoding: 'utf8' }));
      expect(cli).toEqual(result);
      const bad = spawnSync(process.execPath, ['--import', TSX, MAIN, '--root', root, 'similar', ' ', '--json'], { encoding: 'utf8' });
      expect(bad.status).toBe(1);
    });
  });

  it('returns a minimal no-match result and rejects invalid drafts and input', async () => {
    await withIndexedFixture('reuse-app', async (db) => {
      const index = new CandidateIndex(db);
      const none = await findSimilar(index, { description: 'quuxxyzzy' });
      expect(none.matches).toEqual([]);
      expect(renderSimilar(none)).toBe('No matches.');
      await expect(findSimilar(index, { description: '' })).rejects.toThrow();
      await expect(findSimilar(index, { description, detail: 'invalid' } as never)).rejects.toThrow();
      await expect(findSimilar(index, { description, code: 'function {' })).rejects.toThrow('Draft');
      await expect(findSimilar(index, { description, code: 'const x = 1;', language: 'python' })).rejects.toThrow('Draft');
      const long = await findSimilar(index, { description: 'date '.repeat(1900), name: 'x'.repeat(300) });
      expect(estimateTokens(JSON.stringify(long))).toBeLessThanOrEqual(500);
    });
  });
});

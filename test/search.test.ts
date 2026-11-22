import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { evaluateTask, manifest, metrics } from '../bench/search/run.js';
import { defaultConfig } from '../src/config/load.js';
import { findCode } from '../src/index/navigation.js';
import { searchCodeTool } from '../src/mcp/tools/search_code.js';
import { TOOLS } from '../src/mcp/tools/index.js';
import * as embeddings from '../src/reuse/embeddings.js';
import { searchCode } from '../src/search/index.js';
import { alternatives, reciprocalRankFusion, stemTerm, terms } from '../src/search/terms.js';
import { withIndexedFixture } from '../src/selftest/fixtures.js';
import { estimateTokens } from '../src/util/tokens.js';

describe('plain-English search', () => {
  it('drops English filler and splits code identifiers', () => {
    expect(terms('where do we find the code that retries failed HTTPRequests')).toEqual(['find', 'retry', 'fail', 'http', 'request']);
    expect(terms('how is the code that')).toEqual([]);
    expect(terms('')).toEqual([]);
  });
  it('lightly stems retry inflections and symmetrically expands curated vocabulary', () => {
    expect(['retries', 'retrying', 'retried'].map(stemTerm)).toEqual(['retry', 'retry', 'retry']);
    expect(alternatives('remove')).toContain('delete');
    expect(alternatives('delete')).toContain('remove');
    expect(alternatives('fetch')).toEqual(expect.arrayContaining(['get', 'load', 'request']));
    expect(alternatives('unknown')).toEqual(['unknown']);
  });
  it('fuses reciprocal ranks without counting duplicate IDs twice', () => {
    const result = reciprocalRankFusion([['a', 'b', 'b'], ['b', 'c']]);
    expect(result[0]!.id).toBe('b');
    expect(result[0]!.score).toBeCloseTo(1 / 62 + 1 / 61);
    expect(reciprocalRankFusion([])).toEqual([]);
  });
  it('retains exact find_code ranking and returns short evidence with silent missing-model fallback', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const stderr = vi.spyOn(process.stderr, 'write');
      try {
        const hits = await searchCode(db, 'formatDate', { root });
        expect(hits[0]!.id).toBe(findCode(db, 'formatDate')[0]!.id);
        expect(hits[0]!.reason).toBe('exact name');
        expect(hits[0]!.stages).toEqual(['lexical']);
        expect(stderr).not.toHaveBeenCalled();
      } finally { stderr.mockRestore(); }
      expect(await searchCode(db, 'the code that')).toEqual([]);
      expect(await searchCode(db, 'zzzzzznonexistent')).toEqual([]);
      await expect(searchCode(db, 'date', { limit: 0 })).rejects.toThrow('limit');
      await expect(searchCode(db, 'x'.repeat(2049))).rejects.toThrow('query');
    });
  });
  it('uses installed source vectors and fuses both stages', async () => {
    await withIndexedFixture('ts-app', async (db, root) => {
      const local = vi.spyOn(embeddings, 'hasLocalEmbeddings').mockReturnValue(true);
      const embed = vi.spyOn(embeddings, 'embedSources').mockImplementation(async (_root, _config, sources) =>
        new Map(sources.map((s) => [s.id, { model: 'test', vector: [1, 0] }])));
      try {
        const hits = await searchCode(db, 'formatDate', { root });
        expect(hits[0]!.stages).toEqual(['lexical', 'semantic']);
        expect(embed).toHaveBeenCalledOnce();
        expect(embed.mock.calls[0]![2].some((s) => s.text.includes('function formatDate'))).toBe(true);
        embed.mockResolvedValueOnce(new Map());
        expect((await searchCode(db, 'formatDate', { root }))[0]!.stages).toEqual(['lexical']);
      } finally { local.mockRestore(); embed.mockRestore(); }
    });
  });
  it('registers and validates the MCP tool and budgets its output', async () => {
    expect(TOOLS.some((t) => t.name === 'search_code')).toBe(true);
    const schema = z.object(searchCodeTool.inputSchema);
    expect(schema.safeParse({ query: '', limit: -1 }).success).toBe(false);
    expect(schema.safeParse({ query: 'a\u0000' }).success).toBe(false);
    await withIndexedFixture('ts-app', async (db, root) => {
      const ctx = { db, root, config: defaultConfig() };
      const text = await searchCodeTool.handler(schema.parse({ query: 'formatDate' }), ctx);
      expect(text).toContain('formatDate');
      expect(text).toContain('lexical: exact name');
      expect(estimateTokens(text)).toBeLessThanOrEqual(800);
      expect(await searchCodeTool.handler(schema.parse({ query: 'zzzzzznonexistent' }), ctx)).toBe('No matches.');
    });
  });
  it('supports CLI JSON, no matches and JSON validation errors', async () => {
    await withIndexedFixture('ts-app', async (_db, root) => {
      const args = ['--import', import.meta.resolve('tsx'), path.resolve('src/cli/main.ts'), '--root', root, 'search'];
      const run = (query: string, ...rest: string[]) => execFileSync(process.execPath, [...args, query, '--json', ...rest], { encoding: 'utf8' });
      expect(JSON.parse(run('formatDate', '--limit', '1'))[0].name).toBe('formatDate');
      expect(JSON.parse(run('zzzzzznonexistent'))).toEqual([]);
      const bad = spawnSync(process.execPath, [...args, 'date', '--json', '--limit', '0'], { encoding: 'utf8' });
      expect(bad.status).toBe(1);
      expect(JSON.parse(bad.stdout).error).toContain('limit');
    });
  });
  it('runs the benchmark harness on a tiny fixture subset', async () => {
    expect(manifest().tasks).toHaveLength(50);
    expect(metrics([1, 2, 0])).toEqual({ tasks: 3, recall1: 1 / 3, recall5: 2 / 3, mrr: 0.5 });
    await withIndexedFixture('ts-app', async (db) => {
      const task = { id: 'tiny', set: 'exact', corpus: 'fixture', query: 'formatDate', expected: [findCode(db, 'formatDate')[0]!.id] };
      for (const arm of ['baseline', 'lexical'] as const) expect((await evaluateTask(db, task, arm)).rank).toBe(1);
      expect((await evaluateTask(db, { ...task, expected: ['missing'] }, 'lexical')).rank).toBe(0);
    });
  });
});

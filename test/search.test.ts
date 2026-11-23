import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { benchmarkModels, benchmarkOutput, evaluateTask, manifest, metrics, prepareBenchmarkEmbeddings, reuseBenchmarkModels } from '../bench/search/run.js';
import { defaultConfig } from '../src/config/load.js';
import { findCode } from '../src/index/navigation.js';
import { searchDocuments } from '../src/index/query.js';
import * as queryApi from '../src/index/query.js';
import { searchCodeTool } from '../src/mcp/tools/search_code.js';
import { TOOLS } from '../src/mcp/tools/index.js';
import * as embeddings from '../src/reuse/embeddings.js';
import { searchCode } from '../src/search/index.js';
import { alternatives, reciprocalRankFusion, stemTerm, terms } from '../src/search/terms.js';
import { tempDir, withIndexedFixture } from '../src/selftest/fixtures.js';
import { estimateTokens } from '../src/util/tokens.js';
import { sha1 } from '../src/util/hash.js';

describe('plain-English search', () => {
  it('reuses an installed model directory without downloading and ignores missing or invalid stores', () => {
    const root = tempDir('gw-search-model-reuse-');
    const models = path.join(root, 'installed-models');
    const workspace = path.join(root, 'corpus');
    try {
      expect(benchmarkModels([])).toBe(embeddings.embeddingCacheDir(path.resolve('.')));
      expect(benchmarkModels(['--models', models])).toBe(models);
      expect(() => benchmarkModels(['--models'])).toThrow('--models requires');
      expect(() => benchmarkModels(['--models', '--v2'])).toThrow('--models requires');
      reuseBenchmarkModels([workspace], models);
      expect(existsSync(embeddings.embeddingCacheDir(workspace))).toBe(false);
      mkdirSync(models);
      reuseBenchmarkModels([workspace], models);
      expect(existsSync(embeddings.embeddingCacheDir(workspace))).toBe(false);
      writeFileSync(path.join(models, 'weights.bin'), 'unit fixture only');
      writeFileSync(path.join(models, `${sha1(embeddings.DEFAULT_EMBEDDING_MODEL)}.json`), JSON.stringify({
        model: embeddings.DEFAULT_EMBEDDING_MODEL, format: embeddings.EMBEDDING_FORMAT, files: ['weights.bin'],
      }));
      reuseBenchmarkModels([workspace], models);
      expect(embeddings.hasLocalEmbeddings(workspace, embeddings.DEFAULT_EMBEDDING_MODEL)).toBe(true);
      const download = vi.fn();
      expect(prepareBenchmarkEmbeddings([workspace], false, undefined, download).semanticStatus).toBe('RUN');
      expect(download).not.toHaveBeenCalled();
      reuseBenchmarkModels([workspace], path.join(root, 'missing'));
      expect(existsSync(path.join(models, 'weights.bin'))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('refuses published or existing benchmark output and accepts only a new explicit directory', () => {
    const root = tempDir('gw-search-output-');
    try {
      expect(() => benchmarkOutput([], 2)).toThrow('Refusing to overwrite');
      expect(() => benchmarkOutput(['--out', root], 2)).toThrow('Refusing to overwrite');
      expect(() => benchmarkOutput(['--out'], 2)).toThrow('--out requires');
      expect(() => benchmarkOutput(['--out', '--v2'], 2)).toThrow('--out requires');
      expect(benchmarkOutput(['--out', path.join(root, 'new')], 2)).toBe(path.join(root, 'new'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('collects call and literal evidence with two queries independent of symbol count', async () => {
    await withIndexedFixture('ts-app', async (db) => {
      const prepare = vi.spyOn(db, 'prepare');
      try {
        const documents = searchDocuments(db);
        expect(prepare).toHaveBeenCalledTimes(2);
        expect(documents.length).toBeGreaterThan(20);
        expect(documents.some((d) => d.body.includes('formatDate'))).toBe(true);
        expect(documents.some((d) => d.body === '')).toBe(true);
        expect(prepare.mock.calls[0]![0]).toContain('UNION ALL');
      } finally { prepare.mockRestore(); }
    });
  });
  it('requires explicit benchmark download consent and records unavailable or broken setup', () => {
    const install = vi.fn();
    expect(prepareBenchmarkEmbeddings(['a'], false, () => false, install).semanticStatus).toBe('NOT RUN');
    expect(install).not.toHaveBeenCalled();
    expect(prepareBenchmarkEmbeddings(['a'], false, () => true, install).semanticStatus).toBe('RUN');
    let ready = false;
    expect(prepareBenchmarkEmbeddings(['a'], true, () => ready, () => { ready = true; }).semanticStatus).toBe('RUN');
    expect(prepareBenchmarkEmbeddings(['a'], true, () => false, () => { throw new Error('offline'); }).semanticReason).toBe('offline');
  });
  it('drops English filler and splits code identifiers', () => {
    expect(terms('where do we find the code that retries failed HTTPRequests')).toEqual(['find', 'retry', 'fail', 'http', 'request']);
    expect(terms('how is the code that')).toEqual([]);
    expect(terms('')).toEqual([]);
  });
  it('lightly stems retry inflections and symmetrically expands curated vocabulary', () => {
    expect(['retries', 'retrying', 'retried'].map(stemTerm)).toEqual(['retry', 'retry', 'retry']);
    expect(alternatives(stemTerm('remove'))).toContain(stemTerm('delete'));
    expect(alternatives(stemTerm('delete'))).toContain(stemTerm('remove'));
    const settings = terms('settings')[0]!;
    expect(settings).toBe('setting');
    expect(alternatives(settings)).toEqual(expect.arrayContaining(['config', 'setting']));
    expect(alternatives(settings)).not.toContain('set');
    expect(['parse', 'parsed', 'parsing'].map(stemTerm)).toEqual(['pars', 'pars', 'pars']);
    expect(['delete', 'deleted', 'deleting'].map(stemTerm)).toEqual(['delet', 'delet', 'delet']);
    expect(alternatives('fetch')).toEqual(expect.arrayContaining(['get', 'load', 'request']));
    expect(alternatives('unknown')).toEqual(['unknown']);
  });
  it('fuses reciprocal ranks without counting duplicate IDs twice', () => {
    const result = reciprocalRankFusion([['a', 'b', 'b'], ['b', 'c']]);
    expect(result[0]!.id).toBe('b');
    expect(result[0]!.score).toBeCloseTo(1 / 62 + 1 / 61);
    expect(reciprocalRankFusion([])).toEqual([]);
  });
  it('ranks descriptive documentation and indexed local identifiers above incidental name overlap', async () => {
    await withIndexedFixture('ts-app', async (db) => {
      const document = searchDocuments(db)[0]!;
      const docs = vi.spyOn(queryApi, 'searchDocuments').mockReturnValue([
        { ...document, id: 'doc', name: 'execute', qualifiedName: 'execute', doc: 'Delete expired records from storage', body: '' },
        { ...document, id: 'noise', name: 'record', qualifiedName: 'record', doc: '', body: '' },
        { ...document, id: 'body', name: 'perform', qualifiedName: 'perform', doc: '', body: '' },
      ]);
      const symbols = vi.spyOn(queryApi, 'readFingerprintedSymbols').mockReturnValue([
        { fingerprint: { vocab: { expir: 1, record: 2, delet: 1 } }, id: 'body' } as unknown as ReturnType<typeof queryApi.readFingerprintedSymbols>[number],
      ]);
      try {
        const hits = await searchCode(db, 'remove expired records', { semantic: false });
        expect(hits[0]!.id).toBe('doc');
        expect(hits.findIndex((h) => h.id === 'body')).toBeLessThan(hits.findIndex((h) => h.id === 'noise'));
      } finally { docs.mockRestore(); symbols.mockRestore(); }
    });
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
    expect(manifest(2).tasks).toHaveLength(50);
    expect(metrics([1, 2, 0])).toEqual({ tasks: 3, recall1: 1 / 3, recall5: 2 / 3, mrr: 0.5 });
    await withIndexedFixture('ts-app', async (db) => {
      const task = { id: 'tiny', set: 'exact', corpus: 'fixture', query: 'formatDate', expected: [findCode(db, 'formatDate')[0]!.id] };
      for (const arm of ['baseline', 'lexical'] as const) expect((await evaluateTask(db, task, arm)).rank).toBe(1);
      expect((await evaluateTask(db, { ...task, expected: ['missing'] }, 'lexical')).rank).toBe(0);
    });
  });
});

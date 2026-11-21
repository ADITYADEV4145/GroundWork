import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, loadConfig } from '../src/config/load.js';
import { readEmbedding } from '../src/index/query.js';
import { indexDbPath } from '../src/index/store.js';
import { initSqlBackend, openDb } from '../src/store/db.js';
import { CandidateIndex } from '../src/reuse/candidates.js';
import { chooseEmbeddingCandidate } from '../src/reuse/embedding-evaluation.js';
import { embeddingCacheDir, embeddingHash, embedSources, hasLocalEmbeddings, initializeEmbeddings, transformersEmbedder, type EmbedderFactory } from '../src/reuse/embeddings.js';
import { model, meaningModel, probability, scoreSignals } from '../src/reuse/model.js';
import { checkRepository } from '../src/reuse/check.js';
import { findSimilar } from '../src/reuse/similar.js';
import { buildIdf, pairSignals, vectorCosine, type ComparableSymbol } from '../src/reuse/signals.js';
import { withIndexedFixture } from '../src/selftest/fixtures.js';
import { loadDataset } from '../src/reuse/calibration.js';
import { withCheckScenario, writeScenarioFile } from '../src/reuse/scenarios.js';
import { applySetup, planSetup } from '../src/setup/apply.js';
import { profileTarget } from '../src/setup/targets.js';
import evaluation from '../bench/dupes/embeddings-oof.json' with { type: 'json' };

const fake = () => {
  const embed = vi.fn(async (_text: string) => [0.6, 0.8]);
  const factory = vi.fn<EmbedderFactory>(async () => ({ embed }));
  return { embed, factory };
};

describe('consented, offline-only optional meaning', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Tests must not access the network.'); })); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads the optional adapter locally with explicit token limits and remote access disabled', async () => {
    const env: Record<string, unknown> = {};
    const tensor = { data: new Float32Array([0.6, 0.8]), normalize: vi.fn() };
    tensor.normalize.mockReturnValue(tensor);
    const tokenizer = vi.fn(() => ({ attention_mask: 'mask' }));
    const pipeline = vi.fn(async () => ({ tokenizer, model: async () => ({ last_hidden_state: tensor }) }));
    const mean_pooling = vi.fn(() => tensor);
    vi.doMock('@huggingface/transformers', () => ({ env, pipeline, mean_pooling }));
    try {
      const adapter = await transformersEmbedder('owner/model', { cacheDir: '/local/cache', download: false });
      const vector = await adapter.embed('source code');
      expect(vector).toHaveLength(2);
      expect(env.allowRemoteModels).toBe(false);
      expect(env.cacheDir).toBe('/local/cache');
      expect(pipeline).toHaveBeenCalledWith('feature-extraction', 'owner/model', expect.objectContaining({ local_files_only: true, cache_dir: '/local/cache' }));
      expect(tokenizer).toHaveBeenCalledWith('source code', expect.objectContaining({ truncation: true, max_length: 512 }));
      expect(mean_pooling).toHaveBeenCalledWith(tensor, 'mask');
    } finally { vi.doUnmock('@huggingface/transformers'); }
  });

  it('does nothing when disabled or empty, and warns once when local model is absent', async () => {
    await withIndexedFixture('reuse-app', async (_db, root) => {
      const { factory } = fake();
      const config = defaultConfig();
      expect((await embedSources(root, config, [{ id: 'x', text: 'code' }], factory)).size).toBe(0);
      config.reuse.embeddings = { enabled: true, model: meaningModel.embeddingModel };
      expect((await embedSources(root, config, [], factory)).size).toBe(0);
      const warning = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      try {
        for (let i = 0; i < 2; i++) expect((await embedSources(root, config, [{ id: 'x', text: 'code' }], factory)).size).toBe(0);
        expect(warning).toHaveBeenCalledTimes(1);
        expect(String(warning.mock.calls[0]![0])).toContain('using no-meaning model');
      } finally { warning.mockRestore(); }
      expect(factory).not.toHaveBeenCalled();
    });
  });

  it('requires explicit consent, records config only after success, and confines downloads to the cache', async () => {
    await withIndexedFixture('reuse-app', async (_db, root) => {
      const { factory } = fake();
      await expect(initializeEmbeddings(root, { consent: false, factory })).rejects.toThrow('consent');
      await expect(initializeEmbeddings(root, { consent: true, model: '../../escape', factory })).rejects.toThrow('model id');
      expect(factory).not.toHaveBeenCalled();
      await expect(initializeEmbeddings(root, { consent: true, factory: async () => { throw new Error('offline'); } })).rejects.toThrow('offline');
      expect(loadConfig(root).reuse.embeddings.enabled).toBe(false);
      const selected = await initializeEmbeddings(root, { consent: true, factory });
      expect(selected).toBe(meaningModel.embeddingModel);
      expect(factory).toHaveBeenCalledWith(selected, { cacheDir: embeddingCacheDir(root), download: true });
      expect(loadConfig(root).reuse.embeddings).toEqual({ enabled: true, model: selected });
      expect(hasLocalEmbeddings(root, selected)).toBe(true);
      const run = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.resolve('src/cli/main.ts'), '--root', root, 'init', '--model', 'owner/any'], { encoding: 'utf8' });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('--model requires download consent');
    });
  });

  it('caches vectors by exact symbol content and model, including changed symbols and duplicates', async () => {
    await withIndexedFixture('reuse-app', async (_db, root) => {
      const { factory, embed } = fake();
      await initializeEmbeddings(root, { consent: true, factory });
      factory.mockClear();
      const config = loadConfig(root);
      const sources = [{ id: 'one', text: 'def foo(x): return x + 1' }, { id: 'two', text: 'def foo(x): return x + 1' }];
      expect((await embedSources(root, config, sources, factory)).get('one')?.vector).toEqual([0.6, 0.8]);
      expect(factory).toHaveBeenCalledWith(meaningModel.embeddingModel, { cacheDir: embeddingCacheDir(root), download: false });
      expect(embed).toHaveBeenCalledTimes(1);
      factory.mockClear(); embed.mockClear();
      await embedSources(root, config, sources.map((s) => ({ ...s, id: `moved-${s.id}` })), factory);
      expect(factory).not.toHaveBeenCalled(); expect(embed).not.toHaveBeenCalled();
      await embedSources(root, config, [...sources, { id: 'changed', text: 'def foo(x): return x + 2' }], factory);
      expect(embed).toHaveBeenCalledTimes(1);
      await initializeEmbeddings(root, { consent: true, model: 'owner/second', factory });
      embed.mockClear();
      await embedSources(root, loadConfig(root), sources, factory);
      expect(embed).toHaveBeenCalledTimes(1);
      await initSqlBackend();
      const db = openDb(indexDbPath(root), { readonly: true });
      try { expect(readEmbedding(db, meaningModel.embeddingModel, embeddingHash(sources[0]!.text))).toEqual([0.6, 0.8]); }
      finally { db.close(); }
    });
  });

  it.each([undefined, 'minimal'] as const)('writes only embedding keys and preserves an explicit %s profile choice', async (profile) => {
    await withIndexedFixture('reuse-app', async (_db, root) => {
      const file = path.join(root, '.groundwork', 'config.json');
      const raw = profile ? { profile, reuse: { duplicateGate: false }, grounding: { enabled: true } } : {};
      if (profile) writeFileSync(file, JSON.stringify(raw));
      const selected = await initializeEmbeddings(root, { consent: true, factory: fake().factory });
      const embeddings = { enabled: true, model: selected };
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ...raw, reuse: { ...raw.reuse, embeddings } });
      applySetup(root, planSetup(root, [profileTarget(root, 'strict')], 'add'), 'add');
      const configured = JSON.parse(readFileSync(file, 'utf8'));
      expect(configured.profile).toBe(profile ?? 'strict');
      expect(configured.reuse.embeddings).toEqual(embeddings);
    });
  });

  it('fails open on a missing runtime, corrupt vector or removed model artifact without downloading', async () => {
    await withIndexedFixture('reuse-app', async (_db, root) => {
      const { factory } = fake();
      const configDir = path.join(embeddingCacheDir(root), meaningModel.embeddingModel);
      mkdirSync(configDir, { recursive: true });
      writeFileSync(path.join(configDir, 'model.onnx'), 'fake weights');
      await initializeEmbeddings(root, { consent: true, factory });
      const config = loadConfig(root), input = [{ id: 'x', text: 'uncached code' }];
      const warning = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      try {
        const broken = vi.fn<EmbedderFactory>(async (_model, options) => { expect(options.download).toBe(false); throw new Error('optional runtime absent'); });
        expect((await embedSources(root, config, input, broken)).size).toBe(0);
        expect((await embedSources(root, config, input, async () => ({ embed: async () => [NaN] }))).size).toBe(0);
        rmSync(path.join(configDir, 'model.onnx'));
        expect(hasLocalEmbeddings(root, meaningModel.embeddingModel)).toBe(false);
        factory.mockClear();
        expect((await embedSources(root, config, input, factory)).size).toBe(0);
        expect(factory).not.toHaveBeenCalled();
      } finally { warning.mockRestore(); }
    });
  });

  it('uses meaning only for matching, calibrated vectors; otherwise keeps the baseline model', async () => {
    const empty: ComparableSymbol = { name: '', docstring: null, fingerprint: null, params: null, returnType: null };
    const base = pairSignals(empty, empty, buildIdf([]));
    expect(base.meaning).toBeUndefined();
    expect(scoreSignals(base).probability).toBe(probability(base));
    expect(scoreSignals(base).thresholds).toEqual(model.thresholds);
    const a = { ...empty, embedding: { model: meaningModel.embeddingModel, vector: [1, 0] } };
    const b = { ...empty, embedding: { model: meaningModel.embeddingModel, vector: [0.5, 0.5] } };
    const signals = pairSignals(a, b, buildIdf([]));
    expect(signals.meaning).toBeCloseTo(Math.SQRT1_2);
    expect(scoreSignals(signals, a.embedding.model).meaning).toBe(true);
    expect(scoreSignals(signals, a.embedding.model).thresholds).toEqual(meaningModel.thresholds);
    expect(scoreSignals(signals, 'owner/untrained').meaning).toBe(false);
    expect(pairSignals(a, empty, buildIdf([])).meaning).toBeUndefined();
    expect(pairSignals(a, { ...b, embedding: { ...b.embedding, model: 'other/model' } }, buildIdf([])).meaning).toBeUndefined();
    expect(vectorCosine([1], [1, 2])).toBe(0);
    expect(vectorCosine([0], [0])).toBe(0);
    expect(vectorCosine([NaN], [1])).toBe(0);
    await withIndexedFixture('reuse-app', async (db, root) => {
      const { factory } = fake();
      await initializeEmbeddings(root, { consent: true, factory });
      const index = new CandidateIndex(db);
      await index.prepareMeaning(root, loadConfig(root), factory);
      const result = await findSimilar(index, { description: 'parse a date string', code: 'function decode(input: string) { const parts = input.split("-"); return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])); }' });
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches.every((m) => m.why.includes('meaning'))).toBe(true);
    });
  });

  it('chooses BLOCK precision first, then recall, then size, and rejects unsafe/empty choices', () => {
    const x = { precision: 0.96, recall: 0.5, sizeBytes: 2 };
    expect(chooseEmbeddingCandidate([{ precision: 0.95, recall: 0.9, sizeBytes: 1 }, x])).toBe(x);
    expect(chooseEmbeddingCandidate([x, { ...x, recall: 0.6 }]).recall).toBe(0.6);
    expect(chooseEmbeddingCandidate([x, { ...x, sizeBytes: 1 }]).sizeBytes).toBe(1);
    expect(() => chooseEmbeddingCandidate([])).toThrow('95%');
    expect(() => chooseEmbeddingCandidate([{ ...x, precision: 0.94 }])).toThrow('95%');
  });

  it('uses cached meaning in gw check and falls back cleanly when the model is missing', async () => {
    await withCheckScenario('duplicate', async (root) => {
      const baseline = await checkRepository(root);
      const { factory } = fake();
      await initializeEmbeddings(root, { consent: true, factory });
      const config = loadConfig(root);
      const db = openDb(indexDbPath(root), { readonly: true });
      try { await new CandidateIndex(db).prepareMeaning(root, config, factory); }
      finally { db.close(); }
      const active = await checkRepository(root);
      expect(active.blocked).toBe(true);
      const finding = active.findings.find((f) => f.kind === 'duplicate')!;
      expect(finding.signals.some((s) => s.name === 'meaning')).toBe(true);
      config.reuse.embeddings.model = 'missing/uninstalled';
      const warning = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      try {
        const missing = await checkRepository(root, { config });
        expect(missing.findings).toEqual(baseline.findings);
        expect(warning).toHaveBeenCalledOnce();
      } finally { warning.mockRestore(); }
    });
  });

  it.each(['load', 'embed'])('preserves duplicate and grounding findings when cold meaning stalls during %s', async (stage) => {
    await withCheckScenario('duplicate', async (root) => {
      writeScenarioFile(root, 'caller.ts', "import { parseDateString } from './utils.js';\nparseDateString();\n");
      const baseline = await checkRepository(root);
      expect(baseline.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'duplicate', severity: 'BLOCK' }),
        expect.objectContaining({ kind: 'grounding', severity: 'BLOCK' }),
      ]));
      await initializeEmbeddings(root, { consent: true, factory: fake().factory });
      const never = new Promise<never>(() => {});
      const embed = vi.fn(() => never);
      const factory = vi.fn<EmbedderFactory>(async () => stage === 'load' ? never : { embed });
      const report = await checkRepository(root, { timeoutMs: 1500, embeddingFactory: factory });
      expect(report.ms).toBeLessThan(1500);
      expect(factory).toHaveBeenCalledOnce();
      expect(embed).toHaveBeenCalledTimes(stage === 'embed' ? 1 : 0);
      expect(report.findings).toEqual(baseline.findings);
    });
  });

  it('lets a cold manual check finish loading meaning and caches all vectors for the next check', async () => {
    await withCheckScenario('duplicate', async (root) => {
      await initializeEmbeddings(root, { consent: true, factory: fake().factory });
      const embed = vi.fn(async (_text: string) => [1, 0]);
      const factory = vi.fn<EmbedderFactory>(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { embed };
      });
      const report = await checkRepository(root, { embeddingFactory: factory });
      expect(factory).toHaveBeenCalledOnce();
      expect(embed.mock.calls.length).toBeGreaterThan(0);
      expect(report.findings.find((f) => f.kind === 'duplicate')?.signals).toContainEqual({ name: 'meaning', value: 1 });
      factory.mockClear(); embed.mockClear();
      const cached = await checkRepository(root, { embeddingFactory: factory });
      expect(cached.findings).toEqual(report.findings);
      expect(factory).not.toHaveBeenCalled();
      expect(embed).not.toHaveBeenCalled();
    });
  });

  it('retains completed vectors but starts no further embedding work after the optional budget', async () => {
    await withIndexedFixture('reuse-app', async (_db, root) => {
      await initializeEmbeddings(root, { consent: true, factory: fake().factory });
      const embed = vi.fn(async (_text: string): Promise<number[]> => new Promise(() => {}));
      embed.mockResolvedValueOnce([1, 0]);
      const factory = vi.fn<EmbedderFactory>(async () => ({ embed }));
      const config = loadConfig(root);
      const sources = ['one', 'two', 'three'].map((id) => ({ id, text: id }));
      const vectors = await embedSources(root, config, sources, factory, { deadline: Date.now() + 100 });
      expect([...vectors.keys()]).toEqual(['one']);
      expect(embed).toHaveBeenCalledTimes(2);
      factory.mockClear();
      expect((await embedSources(root, config, sources, factory, { deadline: 0 })).size).toBe(0);
      expect(factory).not.toHaveBeenCalled();
      expect((await embedSources(root, config, sources.slice(0, 1), factory)).get('one')?.vector).toEqual([1, 0]);
      expect(factory).not.toHaveBeenCalled();
    });
  });

  it('keeps all saved candidate OOF operating points >=95% and the chosen classifier tied to this corpus', async () => {
    const dataset = await loadDataset(path.resolve('bench/dupes'));
    expect(evaluation.datasetDigest).toBe(dataset.digest);
    const picked = chooseEmbeddingCandidate(evaluation.candidates);
    expect(picked.model).toBe(meaningModel.embeddingModel);
    for (const candidate of evaluation.candidates) {
      const selected = candidate.oof.filter((p) => p.probability >= candidate.block && p.blockEligible);
      const labels = new Map(dataset.examples.map((e) => [e.label.id, e.label]));
      const tp = selected.filter((p) => labels.get(p.id)!.label === 'dup').length;
      expect(tp / selected.length).toBeGreaterThanOrEqual(0.95);
      expect(candidate.oof).toHaveLength(dataset.examples.length);
      expect(candidate.precision).toBe(tp / selected.length);
      const groups = [...new Set(dataset.examples.map((e) => e.group))].sort();
      const folds = new Map(dataset.examples.map((e) => [e.label.id, groups.indexOf(e.group) % 5]));
      for (const p of candidate.oof) expect(p.fold).toBe(folds.get(p.id));
    }
    expect(meaningModel.weights).toEqual(picked.coefficients.weights);
    expect(meaningModel.intercept).toBe(picked.coefficients.intercept);
    expect(readFileSync(path.resolve('src/reuse/model.json'), 'utf8')).not.toContain('meaning');
  });
});

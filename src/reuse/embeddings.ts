import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { GroundworkConfig } from '../config/schema.js';
import { configPath, loadConfig } from '../config/load.js';
import { readEmbedding } from '../index/query.js';
import { writeEmbedding } from '../index/write.js';
import { withWriteLock } from '../index/lock.js';
import { indexDbPath } from '../index/store.js';
import { openDb } from '../store/db.js';
import { sha1 } from '../util/hash.js';
import { log } from '../util/log.js';
import { gwPath } from '../util/paths.js';
import meaningModel from './meaning-model.json' with { type: 'json' };

export const DEFAULT_EMBEDDING_MODEL = meaningModel.embeddingModel;
export const EMBEDDING_FORMAT = 'source-v1:q8:mean:512';
export interface Embedder { embed(text: string): Promise<number[]> }
export type EmbedderFactory = (model: string, options: { cacheDir: string; download: boolean }) => Promise<Embedder>;
export interface Embedding { model: string; vector: number[] }
export const embeddingHash = (text: string) => sha1(`${EMBEDDING_FORMAT}\0${text}`);
export const embeddingCacheDir = (root: string) => gwPath(root, 'models');
const manifestPath = (root: string, model: string) => path.join(embeddingCacheDir(root), `${sha1(model)}.json`);

interface EmbeddingTensor { data: ArrayLike<number | bigint>; normalize(p: number, dim: number): EmbeddingTensor }
interface TransformerPipeline {
  tokenizer(text: string, options: Record<string, unknown>): Record<string, unknown>;
  model(inputs: Record<string, unknown>): Promise<Record<string, EmbeddingTensor>>;
}
interface TransformersRuntime {
  env: Record<string, unknown>;
  pipeline(task: string, model: string, options: Record<string, unknown>): Promise<TransformerPipeline>;
  mean_pooling(tensor: EmbeddingTensor, mask: unknown): EmbeddingTensor;
}

export const transformersEmbedder: EmbedderFactory = async (model, options) => {
  const dependency = '@huggingface/transformers';
  const { env, pipeline, mean_pooling } = await import(dependency) as TransformersRuntime;
  env.allowRemoteModels = options.download;
  env.allowLocalModels = true;
  env.localModelPath = options.cacheDir + path.sep;
  env.useBrowserCache = false;
  env.useFSCache = true;
  env.cacheDir = options.cacheDir;
  let extractor;
  try {
    extractor = await pipeline('feature-extraction', model, {
      cache_dir: options.cacheDir, local_files_only: !options.download, dtype: 'q8', device: 'cpu',
      session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
    });
  } finally { env.allowRemoteModels = false; }
  return { async embed(text) {
    const inputs = extractor.tokenizer(text, { padding: true, truncation: true, max_length: 512 });
    const output = await extractor.model(inputs);
    const hidden = output.last_hidden_state ?? output.logits ?? output.token_embeddings;
    if (!hidden) throw new Error('Model supplies no token embeddings.');
    const result = mean_pooling(hidden, inputs.attention_mask).normalize(2, -1);
    return Array.from(result.data, Number);
  } };
};

export async function initializeEmbeddings(root: string, options: { consent: boolean; model?: string; factory?: EmbedderFactory }): Promise<string> {
  if (!options.consent) throw new Error('Model downloads require explicit consent: gw init --embeddings.');
  const model = options.model ?? DEFAULT_EMBEDDING_MODEL;
  if (!/^[\w.-]+\/[\w.-]+$/.test(model) || model.split('/').some((p) => p === '.' || p === '..')) throw new Error('Expected a Hugging Face model id: owner/name.');
  const cacheDir = embeddingCacheDir(root);
  mkdirSync(cacheDir, { recursive: true });
  await (options.factory ?? transformersEmbedder)(model, { cacheDir, download: true });
  const files = (dir: string): string[] => !existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name); return entry.isDirectory() ? files(p) : [path.relative(cacheDir, p)];
  });
  writeFileSync(manifestPath(root, model), JSON.stringify({ model, format: EMBEDDING_FORMAT, files: files(path.join(cacheDir, model)) }) + '\n');
  const config = loadConfig(root);
  config.reuse.embeddings = { enabled: true, model };
  writeFileSync(configPath(root), JSON.stringify(config, null, 2) + '\n');
  return model;
}

export function hasLocalEmbeddings(root: string, model: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath(root, model), 'utf8'));
    return manifest.model === model && manifest.format === EMBEDDING_FORMAT && Array.isArray(manifest.files) &&
      manifest.files.every((file: unknown) => typeof file === 'string' && existsSync(path.join(embeddingCacheDir(root), file)));
  } catch { return false; }
}

const warned = new Set<string>();
export function warnMeaning(root: string, model: string, error: string): void {
  const key = `${root}\0${model}`;
  if (warned.has(key)) return;
  warned.add(key);
  const message = `Meaning unavailable for ${model}; using no-meaning model. ${error}`;
  process.stderr.write(`gw: ${message}\n`);
  log(root, 'warn', 'meaning_unavailable', { model, error });
}

async function withinBudget<T>(job: () => Promise<T>, deadline = Infinity): Promise<T | undefined> {
  if (Date.now() >= deadline) return undefined;
  if (!Number.isFinite(deadline)) return job();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([job(), new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), Math.max(0, deadline - Date.now())); })]);
  } finally { clearTimeout(timer); }
}

export async function embedSources(root: string, config: GroundworkConfig, sources: { id: string; text: string }[], factory: EmbedderFactory = transformersEmbedder, options: { deadline?: number } = {}): Promise<Map<string, Embedding>> {
  const result = new Map<string, Embedding>();
  if (!config.reuse.embeddings.enabled || !sources.length) return result;
  const model = config.reuse.embeddings.model ?? DEFAULT_EMBEDDING_MODEL;
  if (!hasLocalEmbeddings(root, model)) {
    warnMeaning(root, model, 'Install locally with gw init --embeddings.');
    return result;
  }
  try {
    const pending = new Map<string, string>();
    const vectors = new Map<string, number[]>();
    const db = openDb(indexDbPath(root), { readonly: true });
    try {
      for (const source of sources) {
        if (Date.now() >= (options.deadline ?? Infinity)) break;
        const hash = embeddingHash(source.text);
        const vector = readEmbedding(db, model, hash);
        if (vector) vectors.set(hash, vector);
        else pending.set(hash, source.text);
      }
    } finally { db.close(); }
    if (pending.size) {
      const embedder = await withinBudget(() => factory(model, { cacheDir: embeddingCacheDir(root), download: false }), options.deadline);
      const fresh = new Map<string, number[]>();
      for (const [hash, text] of embedder ? pending : []) {
        const vector = await withinBudget(() => embedder!.embed(text), options.deadline);
        if (!vector) break;
        if (!vector.length || vector.some((v) => !Number.isFinite(v)) || !vector.some((v) => v !== 0)) throw new Error('Invalid embedding vector.');
        fresh.set(hash, vector); vectors.set(hash, vector);
      }
      if (fresh.size) withWriteLock(root, () => {
        const writer = openDb(indexDbPath(root));
        try { writer.transaction(() => { for (const [hash, vector] of fresh) writeEmbedding(writer, model, hash, vector); }); }
        finally { writer.close(); }
      }, 100);
    }
    for (const source of sources) {
      const vector = vectors.get(embeddingHash(source.text));
      if (vector) result.set(source.id, { model, vector });
    }
  } catch (error) { warnMeaning(root, model, (error as Error).message); }
  return result;
}

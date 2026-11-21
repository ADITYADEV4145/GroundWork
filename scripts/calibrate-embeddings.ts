import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { configPath, loadConfig } from '../src/config/load.js';
import { openIndex } from '../src/index/store.js';
import { initSqlBackend } from '../src/store/db.js';
import { chooseBlock, loadDataset, metrics, outOfFold, recallByType, SIGNAL_KEYS, train } from '../src/reuse/calibration.js';
import { embeddingCacheDir, embedSources, initializeEmbeddings } from '../src/reuse/embeddings.js';
import type { Signals } from '../src/reuse/signals.js';
import { vectorCosine } from '../src/reuse/signals.js';
import { chooseEmbeddingCandidate } from '../src/reuse/embedding-evaluation.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(process.env.GW_EMBEDDING_EVAL_CACHE ?? path.join(os.homedir(), 'work/gw-embedding-evaluation'));
const consent = process.argv.includes('--consent-download');
const candidates = ['Xenova/all-MiniLM-L6-v2', 'Xenova/bge-small-en-v1.5', 'Xenova/jina-embeddings-v2-small-en'];
const keys: (keyof Signals)[] = [...SIGNAL_KEYS, 'meaning'];
const pct = (n: number) => `${(100 * n).toFixed(1)}%`;
const size = (dir: string): number => readdirSync(dir).reduce((sum, name) => {
  const p = path.join(dir, name); return sum + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
}, 0);
await initSqlBackend();
mkdirSync(root, { recursive: true });
openIndex(root, loadConfig(root)).db.close();
const dataset = await loadDataset(path.join(repo, 'bench/dupes'));
const sources = dataset.symbols.map((s, i) => ({ id: String(i), text: dataset.sources.get(s)! }));
const results = [];
for (const model of candidates) {
  console.log(`Evaluating ${model} (${sources.length} symbols); downloads ${consent ? 'consented' : 'disabled'}.`);
  if (consent) await initializeEmbeddings(root, { consent, model });
  const config = loadConfig(root); config.reuse.embeddings = { enabled: true, model };
  const start = performance.now();
  const vectors = await embedSources(root, config, sources);
  const ms = performance.now() - start;
  if (vectors.size !== sources.length) throw new Error(`${model}: embeddings unavailable; use --consent-download on first run.`);
  for (let i = 0; i < dataset.symbols.length; i++) dataset.symbols[i]!.embedding = vectors.get(String(i));
  const predictions = outOfFold(dataset, keys);
  const block = chooseBlock(predictions);
  const result = metrics(predictions, block);
  const coefficients = train(dataset.examples.map((e) => ({ ...e, signals: { ...e.signals,
    meaning: e.a.embedding && e.b.embedding ? vectorCosine(e.a.embedding.vector, e.b.embedding.vector) : 0 } })), keys);
  const record = { model, format: 'source-v1:q8:mean:512', sizeBytes: size(path.join(embeddingCacheDir(root), model)), embedMsPerSymbol: ms / sources.length,
    ...result, block, warn: block * 0.6, byType: recallByType(predictions, block), coefficients,
    oof: predictions.map((p) => ({ id: p.example.label.id, fold: p.fold, probability: p.probability })) };
  results.push(record);
  console.log(`${model}: ${pct(result.precision)} precision, ${pct(result.recall)} recall; ${(record.sizeBytes / 1048576).toFixed(1)} MiB, ${record.embedMsPerSymbol.toFixed(2)} ms/symbol.`);
}
const picked = chooseEmbeddingCandidate(results);
writeFileSync(path.join(repo, 'src/reuse/meaning-model.json'), JSON.stringify({ status: 'calibrated-grouped-oof', embeddingModel: picked.model,
  format: picked.format, ...picked.coefficients, thresholds: { block: picked.block, warn: picked.warn },
  calibration: { datasetDigest: dataset.digest, pairs: dataset.examples.length, groups: 12, folds: 5, precision: picked.precision, recall: picked.recall, tp: picked.tp, fp: picked.fp } }, null, 2) + '\n');
writeFileSync(path.join(repo, 'bench/dupes/embeddings-oof.json'), JSON.stringify({ datasetDigest: dataset.digest, candidates: results }, null, 2) + '\n');
const table = '| Model (q8) | Size MiB | Embed ms/symbol | BLOCK | Precision | Recall |\n| --- | ---: | ---: | ---: | ---: | ---: |\n' +
  results.map((r) => `| ${r.model} | ${(r.sizeBytes / 1048576).toFixed(1)} | ${r.embedMsPerSymbol.toFixed(2)} | ${r.block.toFixed(9)} | ${pct(r.precision)} | ${pct(r.recall)} |`).join('\n');
const perType = results.map((r) => `### ${r.model}\n\n| Type | TP | FP | Precision | Recall |\n| --- | ---: | ---: | ---: | ---: |\n` +
  r.byType.map((t) => `| ${t.type} | ${t.tp} | ${t.fp} | ${pct(t.precision)} | ${pct(t.recall)} |`).join('\n')).join('\n\n');
writeFileSync(path.join(repo, 'bench/dupes/embeddings.md'), `# Optional local meaning calibration\n\n${table}\n\nSelected **${picked.model}**, ordered by BLOCK precision then recall, then smaller cache size.\n\n${perType}\n\n## Protocol and limitations\n\nThe same 510 pairs, 12 task-family groups and five family-disjoint OOF folds as [the no-meaning calibration](report.md). Each fold fits IDF on training symbols only. Features are the unchanged ten baseline signals plus cosine similarity of normalized mean-pooled q8 source embeddings (512-token truncation). Corpus labels are unchanged. A pretrained model sees source text only, never labels; no embedding fine-tuning. BLOCK is the lowest OOF threshold reaching 95% precision. WARN is 60% of BLOCK, not a separate safety claim. Per-type precision uses the same selected negative pool for every type.\n\nInference timings include one local model load and cache writes, exclude the consented download, and use one CPU thread. Sizes include the downloaded ONNX weights, tokenizer and config. These are planted/agent-reviewed labels; candidate and threshold selection use these OOF results, not an independent production test. Jina small-en is a general text embedding model; no Xenova ONNX base-code repository was available.\n\nReproduce: \`node --import tsx scripts/calibrate-embeddings.ts --consent-download\`. Omit the flag for fully offline evaluation after installation (timings then reflect vector-cache hits, not inference). Model files and vector cache stay under \`$GW_EMBEDDING_EVAL_CACHE/.groundwork\` (default \`~/work/gw-embedding-evaluation/.groundwork\`).\n`);
const report = path.join(repo, 'bench/dupes/report.md');
const link = '\n## Optional meaning\n\nSee [local embedding evaluation](embeddings.md) for the separate opt-in model. The no-meaning model above is unchanged.\n';
if (!readFileSync(report, 'utf8').includes('(embeddings.md)')) writeFileSync(report, readFileSync(report, 'utf8') + link);
const config = loadConfig(root); config.reuse.embeddings = { enabled: true, model: picked.model };
writeFileSync(configPath(root), JSON.stringify(config, null, 2) + '\n');
console.log(table + `\nSelected ${picked.model}.`);

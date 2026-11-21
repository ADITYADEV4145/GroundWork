import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { initParsers, languageForPath } from '../lang/index.js';
import { sha1 } from '../util/hash.js';
import { buildIdf, pairSignals, type ComparableSymbol, type Signals } from './signals.js';
import { extractReuseSource } from './source.js';
import { canBlock, BLOCK_SCORE_FLOOR } from './policy.js';
import { contractSignals } from './contracts.js';

const refSchema = z.object({ file: z.string().startsWith('corpus/'), symbol: z.string().min(1) });
export const labelSchema = z.object({
  id: z.string().min(1), a: refSchema, b: refSchema,
  label: z.enum(['dup', 'not']), cloneType: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.null()]),
  negativeKind: z.string().optional(), reasoning: z.string().min(15),
}).refine((p) => p.label === 'dup' ? p.cloneType !== null : p.cloneType === null && !!p.negativeKind, 'Labels require a clone type or a negative kind');
export type Label = z.infer<typeof labelSchema>;
export interface Example { label: Label; a: ComparableSymbol; b: ComparableSymbol; group: string; signals: Signals; fixedSignals?: Signals; eligible?: boolean; population?: 'dev' | 'planted'; weight?: number }
export interface Dataset { examples: Example[]; digest: string; symbols: ComparableSymbol[] }
export const SIGNAL_KEYS: (keyof Signals)[] = ['structure', 'exact', 'vocabulary', 'paramCount', 'paramNames', 'returnType', 'name', 'bindingExact', 'structureVocabulary', 'exactVocabulary', 'contractCalls', 'contractReads', 'contractEarlyReturns', 'contractReturnShape', 'contractValidation'];
export const COMBINATIONS: Record<string, (keyof Signals)[]> = {
  structure: ['structure', 'exact'], vocabulary: ['vocabulary'],
  'signature+name': ['paramCount', 'paramNames', 'returnType', 'name'],
  'structure+vocabulary': ['structure', 'exact', 'vocabulary'],
  'vocabulary+signature+name': ['vocabulary', 'paramCount', 'paramNames', 'returnType', 'name'],
  'structure+vocabulary+interactions': ['structure', 'exact', 'vocabulary', 'structureVocabulary', 'exactVocabulary'],
  'binding-aware': ['bindingExact'],
  all: SIGNAL_KEYS,
};

export async function loadDataset(directory: string): Promise<Dataset & { sources: Map<ComparableSymbol, string> }> {
  await initParsers();
  const text = readFileSync(path.join(directory, 'labeled.jsonl'), 'utf8');
  const labels = text.trim().split('\n').map((line) => labelSchema.parse(JSON.parse(line)));
  if (new Set(labels.map((p) => p.id)).size !== labels.length) throw new Error('Duplicate pair id');
  const files = [...new Set(labels.flatMap((p) => [p.a.file, p.b.file]))].sort();
  const symbols = new Map<string, ComparableSymbol>();
  const sources: string[] = [];
  const symbolSources = new Map<ComparableSymbol, string>();
  for (const file of files) {
    const absolute = path.resolve(directory, file);
    if (!absolute.startsWith(path.resolve(directory, 'corpus') + path.sep)) throw new Error('Corpus path escapes directory');
    const language = languageForPath(file);
    if (!language) throw new Error(`Unsupported corpus file ${file}`);
    const source = readFileSync(absolute, 'utf8');
    sources.push(`${file}\n${source}`);
    const extraction = extractReuseSource(source, language);
    if (extraction.hasErrors) throw new Error(`Parse error in ${file}`);
    for (const symbol of extraction.symbols) {
      const key = `${file}:${symbol.qualifiedName}`;
      if (symbols.has(key)) throw new Error(`Ambiguous corpus symbol ${key}`);
      symbols.set(key, { ...symbol, file });
      const stored = symbols.get(key)!;
      symbolSources.set(stored, source.slice(symbol.startByte, symbol.endByte));
    }
  }
  const idf = buildIdf([...symbols.values()]);
  const seen = new Set<string>();
  const examples = labels.map((label) => {
    const keys = [label.a, label.b].map((r) => `${r.file}:${r.symbol}`);
    const key = keys.slice().sort().join('|');
    if (seen.has(key)) throw new Error(`Repeated unordered pair ${label.id}`);
    seen.add(key);
    const a = symbols.get(keys[0]!), b = symbols.get(keys[1]!);
    if (!a?.fingerprint || !b?.fingerprint) throw new Error(`Missing fingerprint for ${label.id}`);
    const group = label.a.file.split('/')[1]!;
    if (group !== label.b.file.split('/')[1]) throw new Error(`Pair crosses task families: ${label.id}`);
    return { label, a, b, group, signals: pairSignals(a, b, idf) };
  });
  return { examples, digest: sha1(text + sources.join('\n')), symbols: [...symbols.values()], sources: symbolSources };
}

export interface Coefficients { intercept: number; weights: Signals }
export async function loadTrainingDataset(directory: string) {
  const dataset = await loadDataset(directory);
  const devDirectory = path.resolve(directory, '../real-history/dev');
  const manifest = JSON.parse(readFileSync(path.join(devDirectory, 'repos.json'), 'utf8')) as { repos: { id: string }[] };
  type Row = { id: string; repo: string; a: { file: string; symbol: string; kind: string }; b: Row['a'];
    review: { label: string; family: string; reason: string }; current: { signals: Signals; related: boolean; compatible: boolean };
    contracts: { a: Parameters<typeof contractSignals>[0]; b: Parameters<typeof contractSignals>[1] } };
  const rows = manifest.repos.flatMap((r) => JSON.parse(readFileSync(path.join(devDirectory, `${r.id}-features.json`), 'utf8')) as Row[]).filter((r) => r.review.label !== 'unknown');
  const examples: Example[] = [...dataset.examples.map((e) => ({ ...e, population: 'planted' as const }))];
  for (const row of rows) {
    const symbol = (r: Row['a']): ComparableSymbol => ({ name: r.symbol.split('.').at(-1)!, qualifiedName: r.symbol, kind: r.kind,
      file: r.file, params: null, returnType: null, docstring: null, fingerprint: null });
    const signals = { ...row.current.signals, ...contractSignals(row.contracts.a, row.contracts.b) };
    examples.push({ label: { id: `dev:${row.id}`, a: { file: `corpus/dev/${row.a.file}`, symbol: row.a.symbol }, b: { file: `corpus/dev/${row.b.file}`, symbol: row.b.symbol },
      label: row.review.label === 'positive' ? 'dup' : 'not', cloneType: null, reasoning: row.review.reason, ...(row.review.label === 'negative' ? { negativeKind: 'real-different-contract' } : {}) },
      a: symbol(row.a), b: symbol(row.b), group: `dev:${row.repo}:${row.review.family}`, population: 'dev', signals, fixedSignals: signals,
      eligible: !row.current.related && row.current.compatible && (signals.structure >= 0.5 || signals.exact === 1 || signals.bindingExact === 1) });
  }
  const counts = new Map<string, number>();
  for (const e of examples) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);
  for (const e of examples) e.weight = e.population === 'dev' ? 1 / counts.get(e.group)! : 1;
  return { ...dataset, examples, plantedDigest: dataset.digest, digest: sha1(dataset.digest + JSON.stringify(rows)) };
}
export function predict(model: Coefficients, signals: Signals): number {
  let value = model.intercept;
  for (const key of Object.keys(model.weights) as (keyof Signals)[]) value += (model.weights[key] ?? 0) * (signals[key] ?? 0);
  return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, value))));
}

export function train(examples: Example[], keys: (keyof Signals)[], iterations = 1800): Coefficients {
  if (!examples.length || !examples.some((e) => e.label.label === 'dup') || !examples.some((e) => e.label.label === 'not')) throw new Error('Training requires both classes');
  const model: Coefficients = { intercept: 0, weights: Object.fromEntries([...new Set([...SIGNAL_KEYS, ...keys])].map((k) => [k, 0])) as unknown as Signals };
  const totalWeight = examples.reduce((n, e) => n + (e.weight ?? 1), 0);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const gradient = Object.fromEntries(keys.map((key) => [key, 0])) as Record<keyof Signals, number>;
    let bias = 0;
    for (const example of examples) {
      const error = (predict(model, example.signals) - (example.label.label === 'dup' ? 1 : 0)) * (example.weight ?? 1);
      bias += error;
      for (const key of keys) gradient[key] += error * (example.signals[key] ?? 0);
    }
    model.intercept -= 0.4 * bias / totalWeight;
    for (const key of keys) model.weights[key] = (model.weights[key] ?? 0) - 0.4 * (gradient[key] / totalWeight + 0.002 * (model.weights[key] ?? 0));
  }
  return model;
}

export interface Prediction { example: Example; probability: number; fold: number; blockEligible?: boolean }
export function outOfFold(dataset: Dataset, keys: (keyof Signals)[], folds = 5): Prediction[] {
  const groups = [...new Set(dataset.examples.map((e) => e.group))].sort();
  if (folds < 2 || folds > groups.length) throw new Error('Invalid fold count');
  const assignments = new Map(groups.map((group, i) => [group, i % folds]));
  const predictions: Prediction[] = [];
  for (let fold = 0; fold < folds; fold++) {
    const training = dataset.examples.filter((e) => assignments.get(e.group) !== fold);
    const idf = buildIdf([...new Set(training.flatMap((e) => [e.a, e.b]))]);
    const features = (e: Example) => ({ ...e, signals: e.fixedSignals ?? pairSignals(e.a, e.b, idf) });
    const model = train(training.map(features), keys);
    for (const example of dataset.examples.filter((e) => assignments.get(e.group) === fold)) {
      const signals = features(example).signals;
      predictions.push({ example, probability: predict(model, signals), fold, blockEligible: example.eligible ?? canBlock(example.a, example.b, signals) });
    }
  }
  return predictions;
}

export function metrics(predictions: Prediction[], threshold: number, blocking = false) {
  const positive = predictions.filter((p) => p.example.label.label === 'dup').length;
  const selected = predictions.filter((p) => p.probability >= threshold && (!blocking || p.blockEligible !== false));
  const tp = selected.filter((p) => p.example.label.label === 'dup').length;
  const fp = selected.length - tp;
  return { tp, fp, fn: positive - tp, precision: selected.length ? tp / selected.length : 0, recall: positive ? tp / positive : 0, support: positive };
}

export function chooseBlock(predictions: Prediction[], target = 0.95): number {
  const candidates = [...new Set(predictions.map((p) => p.probability))].filter((p) => p >= BLOCK_SCORE_FLOOR).sort((a, b) => a - b);
  for (const threshold of candidates) {
    const result = metrics(predictions, threshold, true);
    const planted = metrics(predictions.filter((p) => p.example.population !== 'dev'), threshold, true);
    if (result.tp > 0 && result.precision >= target && planted.precision >= target) return threshold;
  }
  throw new Error('No nonempty BLOCK threshold reaches target precision');
}

export function recallByType(predictions: Prediction[], threshold: number) {
  return [1, 2, 3, 4].map((type) => ({ type, ...metrics(predictions.filter((p) => p.example.label.label === 'not' || p.example.label.cloneType === type), threshold, true) }));
}

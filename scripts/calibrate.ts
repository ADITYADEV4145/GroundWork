import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBlock, COMBINATIONS, loadDataset, metrics, outOfFold, recallByType, SIGNAL_KEYS, train } from '../src/reuse/calibration.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataset = await loadDataset(path.join(root, 'bench/dupes'));
const pct = (value: number) => `${(100 * value).toFixed(1)}%`;
const runs = Object.entries(COMBINATIONS).map(([name, keys]) => {
  const predictions = outOfFold(dataset, keys);
  let threshold: number | null = null;
  try { threshold = chooseBlock(predictions); } catch { /* An ablation may have no safe operating point. */ }
  return { name, predictions, threshold, result: metrics(predictions, threshold ?? 2) };
});
const full = runs.find((run) => run.name === 'all')!;
if (full.threshold === null) throw new Error('Full model cannot reach 95% nonempty OOF precision');
const block = full.threshold;
const warnCandidates = [...new Set(full.predictions.map((p) => p.probability))].filter((p) => p < block);
const f1 = (threshold: number) => {
  const m = metrics(full.predictions, threshold);
  return m.precision + m.recall ? 2 * m.precision * m.recall / (m.precision + m.recall) : 0;
};
const warn = warnCandidates.sort((a, b) => f1(b) - f1(a) || a - b)[0] ?? block / 2;
const model = {
  status: 'calibrated-grouped-oof', ...train(dataset.examples, SIGNAL_KEYS),
  thresholds: { block, warn },
  calibration: { datasetDigest: dataset.digest, pairs: dataset.examples.length, groups: new Set(dataset.examples.map((e) => e.group)).size,
    folds: 5, iterations: 1800, learningRate: 0.4, l2: 0.002, targetPrecision: 0.95,
    precision: full.result.precision, recall: full.result.recall, tp: full.result.tp, fp: full.result.fp },
};
writeFileSync(path.join(root, 'src/reuse/model.json'), JSON.stringify(model, null, 2) + '\n');
writeFileSync(path.join(root, 'bench/dupes/oof.json'), JSON.stringify({ datasetDigest: dataset.digest,
  predictions: full.predictions.map((p) => ({ id: p.example.label.id, fold: p.fold, probability: p.probability })) }, null, 2) + '\n');
const types = recallByType(full.predictions, block);
const positives = dataset.examples.filter((e) => e.label.label === 'dup').length;
const report = `# Reuse calibration report

Optional local embeddings have a [separate evaluation and opt-in model](embeddings.md); the no-meaning model below is unchanged.

## Method and scope

- ${dataset.examples.length} labeled pairs: ${positives} duplicates, ${dataset.examples.length - positives} negatives; TypeScript/JavaScript and Python.
- 12 task families; both languages, every variant, and the array-uniq history snapshots of a family stay in one fold. Five deterministic folds (sorted family names, index modulo five). No symbol/task family appears in both training and validation in a fold.
- Full-batch logistic regression: 1800 iterations, learning rate 0.4, L2 0.002 on weights, unpenalized intercept, no class weighting. Each fold computes IDF only on its training symbols; final weights use whole-corpus IDF.
- Features retain the seven original signals and add a reuse-only binding-aware exact hash, structure×vocabulary and normalized-exact×vocabulary. The complementary hash preserves literals, external/member names and repeated local-identifier roles; it does not replace the coarse Phase 1 fingerprints. Missing/unparseable source supplies zero, never an assumed match. See diagnosis.md for all high-structure negatives and the prior failure's causal checks.
- BLOCK is the lowest distinct OOF score whose inclusive selection has nonzero true positives and >=95% precision. Equal scores are never split. WARN maximizes OOF F1 among lower thresholds (ties choose lower). Thresholds are selected on these OOF predictions, not on an independent final test set.
- Dataset/source SHA-1: \`${dataset.digest}\`. Reproduce offline with \`npm run calibrate\`; regenerate planted corpus with \`node --import tsx scripts/calibrate-corpus.ts\`.
- All labels are authored/reviewed by the coding agent from explicit domains and behavioral differences; no independent human review has occurred. Type 1 formatting, Type 2 identifier rename, Type 3 control-flow refactor, Type 4 alternate implementation. Short bodies are retained for signal evaluation, including bodies the runtime candidate filter would skip.
- Hard negatives include changed policy/boundaries, operator changes, same-name textual overloads, and same-purpose implementations with differing NaN equality. Some are deliberately indistinguishable after token normalization. Repeated template variants and overload scaffolds limit diversity despite family grouping.
- Six real history pairs from MIT-licensed sindresorhus/array-uniq are included (see corpus/unique-values/oss/LICENSE and oss-pairs.jsonl). These are compatibility implementations and their modern replacement, not six independently discovered refactorings. Both commits are pinned; \`node --import tsx scripts/calibrate-mine.ts\` fetches snapshots into a home-directory cache. Calibration/selftests make no network calls.
- This is a small planted-corpus operating point, NOT a claim of >=95% production precision, language-general semantic equivalence, or independent benchmark success. Selection uncertainty and the small number of task families matter; Phase 3's other gate checks are not implemented here.
- No corpus sources or labels were changed to improve the score. Previous seven-feature model: 14 TP / 0 FP, 5.8% recall, Type 1 0%, Type 2 25%, Type 3 1.4%. Binding-aware hashing is a lexical approximation rather than scope-resolved equivalence; shadowing and dynamic dispatch remain limitations. Multiple feature designs have now been examined on these OOF folds; an independent evaluation set is still needed.

## Operating point

BLOCK = ${block.toFixed(9)}; WARN = ${warn.toFixed(9)}.

| Selection | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| BLOCK (all signals, OOF) | ${full.result.tp} | ${full.result.fp} | ${full.result.fn} | ${pct(full.result.precision)} | ${pct(full.result.recall)} |
| WARN or higher (OOF) | ${metrics(full.predictions, warn).tp} | ${metrics(full.predictions, warn).fp} | ${metrics(full.predictions, warn).fn} | ${pct(metrics(full.predictions, warn).precision)} | ${pct(metrics(full.predictions, warn).recall)} |

## By clone type at full-model BLOCK

Precision compares selected positives of this type against ALL selected negatives (the same negative pool is reused per row); recall uses only positives of this type.

| Clone type | Positive support | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
${types.map((m) => `| Type ${m.type} | ${m.support} | ${m.tp} | ${m.fp} | ${pct(m.precision)} | ${pct(m.recall)} |`).join('\n')}

## Signal combinations (each trained and thresholded independently on OOF scores)

| Signals | BLOCK | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
${runs.map((r) => `| ${r.name} | ${r.threshold?.toFixed(6) ?? 'no safe threshold'} | ${r.result.tp} | ${r.result.fp} | ${pct(r.result.precision)} | ${pct(r.result.recall)} |`).join('\n')}

## Recall by type for each signal combination

| Signals | Type 1 recall | Type 2 recall | Type 3 recall | Type 4 recall |
| --- | ---: | ---: | ---: | ---: |
${runs.map((r) => `| ${r.name} | ${recallByType(r.predictions, r.threshold ?? 2).map((m) => pct(m.recall)).join(' | ')} |`).join('\n')}

## False positives at BLOCK

${full.predictions.filter((p) => p.probability >= block && p.example.label.label === 'not').map((p) => `- ${p.example.label.id}: ${p.probability.toFixed(6)}; ${p.example.label.reasoning}`).join('\n') || 'None.'}

## First 15 missed positive examples

${full.predictions.filter((p) => p.probability < block && p.example.label.label === 'dup').slice(0, 15).map((p) => `- ${p.example.label.id}: ${p.probability.toFixed(6)}; ${p.example.label.reasoning}`).join('\n') || 'None.'}
`;
writeFileSync(path.join(root, 'bench/dupes/report.md'), report);
console.log(`Calibration: ${dataset.examples.length} pairs, ${model.calibration.groups} task-family groups, 5 folds (family-disjoint).`);
console.log(`BLOCK ${block.toFixed(9)}: TP ${full.result.tp}, FP ${full.result.fp}, precision ${pct(full.result.precision)}, recall ${pct(full.result.recall)}; WARN ${warn.toFixed(9)}.`);
console.log(types.map((m) => `Type ${m.type}: ${m.tp}/${m.support} recall ${pct(m.recall)}`).join('\n'));
console.log('Wrote src/reuse/model.json, bench/dupes/oof.json and bench/dupes/report.md.');

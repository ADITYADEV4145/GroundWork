import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBlock, loadTrainingDataset, metrics, outOfFold, recallByType, SIGNAL_KEYS, train } from '../src/reuse/calibration.js';
import { BLOCK_POLICY } from '../src/reuse/policy.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataset = await loadTrainingDataset(path.join(root, 'bench/dupes'));
const predictions = outOfFold(dataset, SIGNAL_KEYS);
const block = chooseBlock(predictions);
const candidates = [...new Set(predictions.map((p) => p.probability))].filter((p) => p < block);
const f1 = (t: number) => { const m = metrics(predictions, t); return 2 * m.precision * m.recall / (m.precision + m.recall || 1); };
const warn = candidates.sort((a, b) => f1(b) - f1(a) || a - b)[0] ?? block / 2;
const planted = predictions.filter((p) => p.example.population === 'planted');
const development = predictions.filter((p) => p.example.population === 'dev');
const combined = metrics(predictions, block, true), labeled = metrics(planted, block, true);
const byType = recallByType(planted, block);
const calibration = { datasetDigest: dataset.digest, plantedDigest: dataset.plantedDigest,
  pairs: dataset.examples.length, groups: new Set(dataset.examples.map((e) => e.group)).size,
  folds: 5, iterations: 1800, learningRate: 0.4, l2: 0.002, targetPrecision: 0.95,
  ...combined, planted: labeled, development: metrics(development, block, true), byType };
const model = { status: 'calibrated-grouped-oof', blockPolicy: BLOCK_POLICY, ...train(dataset.examples, SIGNAL_KEYS), thresholds: { block, warn }, calibration };
const oldMeaning = JSON.parse(readFileSync(path.join(root, 'src/reuse/meaning-model.json'), 'utf8'));
writeFileSync(path.join(root, 'src/reuse/model.json'), JSON.stringify(model, null, 2) + '\n');
writeFileSync(path.join(root, 'src/reuse/meaning-model.json'), JSON.stringify({ ...model, embeddingModel: oldMeaning.embeddingModel,
  format: oldMeaning.format, meaningContribution: 'Retrieval remains optional; scoring uses the same contract classifier, with meaning weight zero because embeddings were not fitted in this development experiment.',
  weights: { ...model.weights, meaning: 0 } }, null, 2) + '\n');
const evidence = { method: 'Five family-disjoint folds; dev families each have unit training weight, retaining the planted clone-type population weights; dev unknowns excluded. Dev IDF is precomputed from each real source snapshot, without label information. Planted IDF is training-fold-only. Lowest OOF threshold >= preexisting confidence floor reaching >=95% BOTH combined and planted BLOCK precision. No reserved histories consulted. A prior all-family-unit fit was rejected before replay for 8.2% planted recall despite 100% precision.',
  ...calibration, thresholds: model.thresholds, keys: SIGNAL_KEYS,
  predictions: predictions.map((p) => ({ id: p.example.label.id, family: p.example.group, population: p.example.population,
    label: p.example.label.label, cloneType: p.example.label.cloneType, fold: p.fold, probability: p.probability, eligible: p.blockEligible })) };
writeFileSync(path.join(root, 'bench/real-history/calibration.json'), JSON.stringify(evidence, null, 2) + '\n');
const pct = (x: number) => (x * 100).toFixed(2) + '%';
writeFileSync(path.join(root, 'bench/real-history/calibration.md'), `# Contract-aware calibration before replay

${evidence.method}

Training: ${calibration.pairs} pairs / ${calibration.groups} families. Unknown dev cases are withheld. The 21 backend combinations carry one family unit, not 21. The eight positive dev families are extract/extend positives under the separately frozen review standard, not direct-substitution claims. No new source extraction/index output is stored: schema and extractor versions are unchanged.

Only calls, reads, early-return ratio, return shape and validation similarity are added to the ten existing signals. Empty/missing contracts contribute zero evidence, never perfect agreement. Independence, callable/class kind compatibility and majority structure-or-exact eligibility remain unchanged. WARN uses the same classifier with an OOF F1 threshold. Optional meaning still supplies retrieval; its scoring weight is zero rather than fitting uncollected dev vectors.

| Population | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| Planted labeled set | ${labeled.tp} | ${labeled.fp} | ${pct(labeled.precision)} | ${pct(labeled.recall)} |
| Development pairs | ${calibration.development.tp} | ${calibration.development.fp} | ${pct(calibration.development.precision)} | ${pct(calibration.development.recall)} |
| Combined | ${combined.tp} | ${combined.fp} | ${pct(combined.precision)} | ${pct(combined.recall)} |

| Planted clone type | TP / support | Recall |
| --- | ---: | ---: |
${byType.map((r) => `| ${r.type} | ${r.tp}/${r.support} | ${pct(r.recall)} |`).join('\n')}

BLOCK ${block}; WARN ${warn}. Dataset SHA-1 ${dataset.digest}. These OOF scores selected the operating point: they are not independent production precision estimates. Dev sensitivity is pair scoring, not introduction-commit or end-to-end recall. Replay and introduction estimates are reported separately. Reproduce with npm run calibrate.
`);
console.log(JSON.stringify({ thresholds: model.thresholds, calibration }, null, 2));

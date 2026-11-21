import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBlock, loadDataset, metrics, outOfFold, recallByType, SIGNAL_KEYS, train } from '../../reuse/calibration.js';
import { model } from '../../reuse/model.js';
import type { Check } from '../registry.js';

export const PHASE3_CHECKS: Check[] = [{
  phase: 3,
  name: 'reuse BLOCK precision >= 95% (family-disjoint OOF)',
  async run() {
    const directory = fileURLToPath(new URL('../../../', import.meta.url));
    const dataset = await loadDataset(path.join(directory, 'bench/dupes'));
    const predictions = outOfFold(dataset, SIGNAL_KEYS);
    const threshold = chooseBlock(predictions);
    const result = metrics(predictions, model.thresholds.block);
    const final = train(dataset.examples, SIGNAL_KEYS);
    const fresh = dataset.digest === model.calibration.datasetDigest && dataset.examples.length === model.calibration.pairs &&
      Math.abs(threshold - model.thresholds.block) < 1e-12 && Math.abs(final.intercept - model.intercept) < 1e-12 &&
      SIGNAL_KEYS.every((key) => Math.abs(final.weights[key] - model.weights[key]) < 1e-12);
    const byType = recallByType(predictions, model.thresholds.block);
    const recall = byType.map((r) => `Type ${r.type} ${r.tp}/${r.support} (${(100 * r.recall).toFixed(1)}%)`).join(', ');
    return {
      ok: fresh && dataset.examples.length >= 400 && result.tp > 0 && result.precision >= 0.95,
      detail: `${fresh ? '' : 'STALE calibration; run npm run calibrate. '}${result.tp} TP, ${result.fp} FP, precision ${(100 * result.precision).toFixed(1)}%; recall ${recall}. Planted-corpus calibration only; other Phase 3 gates not yet implemented.`,
      metrics: { precision: result.precision, recall: result.recall, pairs: dataset.examples.length,
        ...Object.fromEntries(byType.map((r) => [`recallType${r.type}`, r.recall])) },
    };
  },
}];

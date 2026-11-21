import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chooseBlock, loadDataset, metrics, outOfFold, recallByType, SIGNAL_KEYS, train } from '../../reuse/calibration.js';
import { model, meaningModel } from '../../reuse/model.js';
import { loadConfig } from '../../config/load.js';
import { DEFAULT_EMBEDDING_MODEL, embedSources } from '../../reuse/embeddings.js';
import { pairSignals, buildIdf } from '../../reuse/signals.js';
import { findRepoRoot } from '../../util/paths.js';
import { checkRepository } from '../../reuse/check.js';
import { assertCheckScenario, assertStopScenario, CHECK_SCENARIOS, withCheckScenario } from '../../reuse/scenarios.js';
import type { Check } from '../registry.js';

export const PHASE3_CHECKS: Check[] = [{
  phase: 3,
  name: 'reuse BLOCK precision >= 95% (family-disjoint OOF)',
  async run(options) {
    const directory = fileURLToPath(new URL('../../../', import.meta.url));
    const dataset = await loadDataset(path.join(directory, 'bench/dupes'));
    const root = options.root ?? findRepoRoot();
    const config = loadConfig(root);
    let meaning = false;
    if (config.reuse.embeddings.enabled && (config.reuse.embeddings.model ?? DEFAULT_EMBEDDING_MODEL) === meaningModel.embeddingModel) {
      const sources = dataset.symbols.map((s, i) => ({ id: String(i), text: dataset.sources.get(s)! }));
      const vectors = await embedSources(root, config, sources);
      meaning = vectors.size === sources.length;
      if (meaning) {
        for (let i = 0; i < dataset.symbols.length; i++) dataset.symbols[i]!.embedding = vectors.get(String(i));
        const idf = buildIdf(dataset.symbols);
        for (const example of dataset.examples) example.signals = pairSignals(example.a, example.b, idf);
      }
    }
    const active = meaning ? meaningModel : model;
    const keys = meaning ? [...SIGNAL_KEYS, 'meaning' as const] : SIGNAL_KEYS;
    const predictions = outOfFold(dataset, keys);
    const threshold = chooseBlock(predictions);
    const result = metrics(predictions, active.thresholds.block);
    const final = train(dataset.examples, keys);
    const weights: Partial<Record<keyof typeof final.weights, number>> = active.weights;
    const fresh = dataset.digest === active.calibration.datasetDigest && dataset.examples.length === active.calibration.pairs &&
      Math.abs(threshold - active.thresholds.block) < 1e-12 && Math.abs(final.intercept - active.intercept) < 1e-12 &&
      keys.every((key) => Math.abs((final.weights[key] ?? 0) - (weights[key] ?? 0)) < 1e-12);
    const byType = recallByType(predictions, active.thresholds.block);
    const recall = byType.map((r) => `Type ${r.type} ${r.tp}/${r.support} (${(100 * r.recall).toFixed(1)}%)`).join(', ');
    return {
      ok: fresh && dataset.examples.length >= 400 && result.tp > 0 && result.precision >= 0.95,
      detail: `Meaning ${meaning ? `active (${meaningModel.embeddingModel})` : 'inactive (no-meaning model)'}; ${fresh ? '' : 'STALE calibration; rerun the corresponding calibration script. '}${result.tp} TP, ${result.fp} FP, precision ${(100 * result.precision).toFixed(1)}%; recall ${recall}. Planted-corpus calibration; not independent production evidence.`,
      metrics: { precision: result.precision, recall: result.recall, pairs: dataset.examples.length,
        ...Object.fromEntries(byType.map((r) => [`recallType${r.type}`, r.recall])) },
    };
  },
}, ...CHECK_SCENARIOS.map((name): Check => ({
  phase: 3,
  name: `reuse check git scenario: ${name}`,
  async run() {
    await withCheckScenario(name, async (root) => assertCheckScenario(name, await checkRepository(root), root));
    return { ok: true, detail: 'base commit + worktree change verified' };
  },
})), {
  phase: 3,
  name: 'duplicate Stop gate blocks once, respects stop_hook_active',
  async run() {
    await withCheckScenario('duplicate', assertStopScenario);
    return { ok: true, detail: 'active recursion allowed; first stop denied; second stop allowed and logged ignored' };
  },
}, {
  phase: 3,
  slow: true,
  name: 'built Stop hook fresh-process p95 < 300 ms (warm index)',
  async run() {
    const main = fileURLToPath(new URL('../../../dist/cli/main.js', import.meta.url));
    if (!existsSync(main)) return { ok: false, detail: 'Run npm run build before the built Stop latency check.' };
    return withCheckScenario('duplicate', async (root) => {
      await checkRepository(root);
      const session = randomUUID();
      const times: number[] = [];
      for (let i = -1; i < 35; i++) {
        const start = performance.now();
        const result = spawnSync(process.execPath, [main, 'hook', 'claude', 'stop'], {
          cwd: root, encoding: 'utf8', timeout: 5000,
          input: JSON.stringify({ cwd: root, session_id: `${session}-${i}` }),
        });
        const ms = performance.now() - start;
        let blocked = false;
        try { blocked = JSON.parse(result.stdout).decision === 'block'; } catch { /* Not a successful block. */ }
        if (result.status !== 0 || !blocked) return { ok: false, detail: `Stop sample ${i} did not block: ${result.error?.message ?? result.stderr ?? result.stdout}` };
        if (i >= 0) times.push(ms);
      }
      times.sort((a, b) => a - b);
      const p50 = times[Math.ceil(times.length * 0.5) - 1]!;
      const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
      return { ok: p95 < 300,
        detail: `built Stop: p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms over ${times.length} fresh processes; warm index/compile cache, startup included; every sample blocked`,
        metrics: { p50Ms: p50, p95Ms: p95, samples: times.length } };
    });
  },
}];

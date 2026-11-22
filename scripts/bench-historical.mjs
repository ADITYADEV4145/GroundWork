import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionSummary } from '../dist/bench/session-stats.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/bench-historical.mjs OUTPUT.md');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cell = (m, scale = 1) => !m ? 'unavailable' : `${(m.baselineMean / scale).toFixed(2)} → ${(m.groundworkMean / scale).toFixed(2)}; ${m.reductionPct ? `${m.reductionPct.median.toFixed(1)}% [${m.reductionPct.low.toFixed(1)}, ${m.reductionPct.high.toFixed(1)}]` : 'unavailable'}`;
const lines = ['# Historical session-estimator sensitivity', '',
  'Report only; archives and published results are unchanged. Fixed seed 0x51ab17ed, 10,000 independent whole-session draws/arm; 95% nearest-rank intervals. Eight sessions/arm per round, not the pre-registered 16-session v7 experiment.',
  'Elapsed is the historical first-begin→last-finish envelope proxy, not controller-owned pre-disclosure timing. Tool-side time is unavailable. Ratios of arm means; positive reduction favors GW. Bytes are UTF-8 tool output, not billed tokens. Changed rounds are not pooled. Guardrail means no category success drop; not proof of equal quality.', '',
  '| Suite | Round | Envelope s/task B → GW; reduction [CI] | Bytes/session B → GW; reduction [CI] | Tool-side | Success B / GW | Guardrail |',
  '| --- | --- | --- | --- | --- | --- | --- |'];
for (const suite of ['nav', 'long-horizon']) for (const round of ['', 'v2', 'v3', 'v4', 'v5', 'v6']) {
  const dir = path.join(root, 'bench', suite, round);
  const { evidence, summary } = json(path.join(dir, 'results/combined.json'))[0];
  const prefix = round ? `${suite === 'nav' ? 'nav' : 'lh'}${round === 'v2' && suite === 'nav' ? '' : round.slice(1)}` : suite === 'nav' ? 'nav' : 'lh2';
  for (const c of evidence.captures) {
    const raw = json(path.join(dir, 'observations', `${prefix}-${c.condition}-${c.run}.json`));
    for (const sample of c.samples) {
      const o = raw.observations.find((o) => o.task === sample.task);
      sample.startedAt = o.startedAt; sample.endedAt = o.startedAt + o.wallMs;
    }
  }
  const p = sessionSummary(evidence, summary.tasks.length, 8);
  lines.push(`| ${suite} | ${round || 'original'} | ${cell(p.elapsedMsPerTask, 1000)} | ${cell(p.emittedBytesPerSession)} | unavailable | ${summary.baseline.success}/${summary.baseline.attempts} / ${summary.groundwork.success}/${summary.groundwork.attempts} | ${summary.noSuccessDrop ? 'met' : 'NOT MET'} |`);
}
lines.push('', 'Post-hoc sensitivity only: do not replace preregistered historical conclusions with a selected favorable estimand. Intervals condition on observed within-round session mixtures, not unmeasured shared-wave or new-project variance.', '');
writeFileSync(output, lines.join('\n'));
console.log(`Historical report: ${output}`);

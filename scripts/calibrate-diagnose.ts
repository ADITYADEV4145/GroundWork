import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, type Example } from '../src/reuse/calibration.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataset = await loadDataset(path.join(root, 'bench/dupes'));
const populations: [string, Example[]][] = [
  ['Type 1 positives', dataset.examples.filter((e) => e.label.cloneType === 1)],
  ['Type 2 positives', dataset.examples.filter((e) => e.label.cloneType === 2)],
  ['Negatives', dataset.examples.filter((e) => e.label.label === 'not')],
];
const rows = populations.map(([name, examples]) => {
  const values = examples.map((e) => e.signals.structure).sort((a, b) => a - b);
  return `| ${name} | ${values.length} | ${values[0]} | ${values[Math.floor(values.length / 2)]} | ${values.at(-1)} | ${examples.filter((e) => e.signals.exact).length} | ${values.filter((v) => v >= 0.9).length} | ${examples.filter((e) => e.signals.bindingExact).length} |`;
});
const negatives = dataset.examples.filter((e) => e.label.label === 'not' && e.signals.structure >= 0.9);
const output = `# Structure diagnosis

Corpus/source SHA-1: \`${dataset.digest}\`. Reproduce with \`node --import tsx scripts/calibrate-diagnose.ts\`.

| Population | Count | MinHash min | MinHash median | MinHash max | Equal normHash | MinHash >= 0.9 | Equal binding-aware hash |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

## All negatives with MinHash >= 0.9

| Pair | MinHash | normHash equal | Vocabulary cosine | Binding-aware equal |
| --- | ---: | ---: | ---: | ---: |
${negatives.map((e) => `| ${e.label.id} | ${e.signals.structure} | ${e.signals.exact} | ${e.signals.vocabulary.toFixed(6)} | ${e.signals.bindingExact} |`).join('\n')}

## Causal checks

- The live calibration loader parses each referenced source with the adapters, requires a non-null fingerprint, and passes it to pairSignals. outOfFold recomputes pairSignals with training-only IDF; train and predict iterate SIGNAL_KEYS including structure and exact. Thus these signals execute in the actual reported calibration path, not merely in a separate diagnostic.
- Attempted disproof of a broken/empty fingerprint: all 24 Type-1 and all 48 Type-2 pairs have MinHash exactly 1 and equal normalized hashes. Negatives span MinHash 0..1, so the values are neither missing nor a constant default.
- Source inspection explains every high-structure negative. Clamp returns the opposite parameter (low/high), parse-port changes the minimum numeric literal (1 to 1024), and slug changes member names (lower to upper) and separators. The Phase 1 normalizer intentionally maps identifiers including property identifiers to ID, numbers to NUM and strings to STR, so these 18 genuinely different-behavior pairs collide. The six base/format/renamed comparisons per task across two languages account for all 18. No labels or source files were changed for this fix.
- The old seven-feature additive model learned negative structure (-3.0125) and name (-3.1315) weights in this confounded corpus; normalized exactness alone could not distinguish those collisions, and the global 95%-precision cutoff excluded all Type-1 pairs. This was a representation/model problem, not missing features, broken index deserialization, or mislabeled copies.
- The reuse-only binding-aware hash preserves numeric/string literals, external/member names and repeated local-identifier roles, while consistently abstracting parameters, local declarations and self-recursion. It separates all 18 collisions here without changing Phase 1 extraction or the corpus. This is a conservative lexical approximation, not a scope-resolved semantic-equivalence proof; different quotes/messages/templates can reduce recall and shadowing can remain ambiguous.
- The combined logistic model also receives structure×vocabulary and normalized-exact×vocabulary interactions. The report retains coarse structure-only and interaction-only ablations rather than claiming the original normalized hash is now collision-free.
`;
writeFileSync(path.join(root, 'bench/dupes/diagnosis.md'), output);
console.log(output);

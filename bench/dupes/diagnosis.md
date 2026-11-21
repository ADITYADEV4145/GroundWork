# Structure diagnosis

Corpus/source SHA-1: `9c7a7c5a8ef11c379560ee2f70f9782ce093b9fa`. Reproduce with `node --import tsx scripts/calibrate-diagnose.ts`.

| Population | Count | MinHash min | MinHash median | MinHash max | Equal normHash | MinHash >= 0.9 | Equal binding-aware hash |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Type 1 positives | 24 | 1 | 1 | 1 | 24 | 24 | 24 |
| Type 2 positives | 48 | 1 | 1 | 1 | 48 | 48 | 48 |
| Negatives | 267 | 0 | 0.0859375 | 1 | 18 | 18 | 0 |

## All negatives with MinHash >= 0.9

| Pair | MinHash | normHash equal | Vocabulary cosine | Binding-aware equal |
| --- | ---: | ---: | ---: | ---: |
| clamp-range-ts-base-changed | 1 | 1 | 0.766254 | 0 |
| clamp-range-ts-format-changed | 1 | 1 | 0.766254 | 0 |
| clamp-range-ts-renamed-changed | 1 | 1 | 0.337657 | 0 |
| clamp-range-py-base-changed | 1 | 1 | 0.766254 | 0 |
| clamp-range-py-format-changed | 1 | 1 | 0.766254 | 0 |
| clamp-range-py-renamed-changed | 1 | 1 | 0.337657 | 0 |
| parse-port-ts-base-changed | 1 | 1 | 0.795562 | 0 |
| parse-port-ts-format-changed | 1 | 1 | 0.795562 | 0 |
| parse-port-ts-renamed-changed | 1 | 1 | 0.727221 | 0 |
| parse-port-py-base-changed | 1 | 1 | 0.801235 | 0 |
| parse-port-py-format-changed | 1 | 1 | 0.801235 | 0 |
| parse-port-py-renamed-changed | 1 | 1 | 0.736627 | 0 |
| slug-text-ts-base-changed | 1 | 1 | 0.779777 | 0 |
| slug-text-ts-format-changed | 1 | 1 | 0.779777 | 0 |
| slug-text-ts-renamed-changed | 1 | 1 | 0.661538 | 0 |
| slug-text-py-base-changed | 1 | 1 | 0.774936 | 0 |
| slug-text-py-format-changed | 1 | 1 | 0.774936 | 0 |
| slug-text-py-renamed-changed | 1 | 1 | 0.653337 | 0 |

## Causal checks

- The live calibration loader parses each referenced source with the adapters, requires a non-null fingerprint, and passes it to pairSignals. outOfFold recomputes pairSignals with training-only IDF; train and predict iterate SIGNAL_KEYS including structure and exact. Thus these signals execute in the actual reported calibration path, not merely in a separate diagnostic.
- Attempted disproof of a broken/empty fingerprint: all 24 Type-1 and all 48 Type-2 pairs have MinHash exactly 1 and equal normalized hashes. Negatives span MinHash 0..1, so the values are neither missing nor a constant default.
- Source inspection explains every high-structure negative. Clamp returns the opposite parameter (low/high), parse-port changes the minimum numeric literal (1 to 1024), and slug changes member names (lower to upper) and separators. The Phase 1 normalizer intentionally maps identifiers including property identifiers to ID, numbers to NUM and strings to STR, so these 18 genuinely different-behavior pairs collide. The six base/format/renamed comparisons per task across two languages account for all 18. No labels or source files were changed for this fix.
- The old seven-feature additive model learned negative structure (-3.0125) and name (-3.1315) weights in this confounded corpus; normalized exactness alone could not distinguish those collisions, and the global 95%-precision cutoff excluded all Type-1 pairs. This was a representation/model problem, not missing features, broken index deserialization, or mislabeled copies.
- The reuse-only binding-aware hash preserves numeric/string literals, external/member names and repeated local-identifier roles, while consistently abstracting parameters, local declarations and self-recursion. It separates all 18 collisions here without changing Phase 1 extraction or the corpus. This is a conservative lexical approximation, not a scope-resolved semantic-equivalence proof; different quotes/messages/templates can reduce recall and shadowing can remain ambiguous.
- The combined logistic model also receives structure×vocabulary and normalized-exact×vocabulary interactions. The report retains coarse structure-only and interaction-only ablations rather than claiming the original normalized hash is now collision-free.

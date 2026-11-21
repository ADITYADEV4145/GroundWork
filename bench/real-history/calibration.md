# Contract-aware calibration before replay

Five family-disjoint folds; dev families each have unit training weight, retaining the planted clone-type population weights; dev unknowns excluded. Dev IDF is precomputed from each real source snapshot, without label information. Planted IDF is training-fold-only. Lowest OOF threshold >= preexisting confidence floor reaching >=95% BOTH combined and planted BLOCK precision. No reserved histories consulted. A prior all-family-unit fit was rejected before replay for 8.2% planted recall despite 100% precision.

Training: 573 pairs / 41 families. Unknown dev cases are withheld. The 21 backend combinations carry one family unit, not 21. The eight positive dev families are extract/extend positives under the separately frozen review standard, not direct-substitution claims. No new source extraction/index output is stored: schema and extractor versions are unchanged.

Only calls, reads, early-return ratio, return shape and validation similarity are added to the ten existing signals. Empty/missing contracts contribute zero evidence, never perfect agreement. Independence, callable/class kind compatibility and majority structure-or-exact eligibility remain unchanged. WARN uses the same classifier with an OOF F1 threshold. Optional meaning still supplies retrieval; its scoring weight is zero rather than fitting uncollected dev vectors.

| Population | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| Planted labeled set | 69 | 1 | 98.57% | 28.40% |
| Development pairs | 4 | 1 | 80.00% | 14.29% |
| Combined | 73 | 2 | 97.33% | 26.94% |

| Planted clone type | TP / support | Recall |
| --- | ---: | ---: |
| 1 | 24/24 | 100.00% |
| 2 | 42/48 | 87.50% |
| 3 | 3/72 | 4.17% |
| 4 | 0/99 | 0.00% |

BLOCK 0.7550627041535564; WARN 0.3891014490985248. Dataset SHA-1 230ad7f03ded0efa029bf5ed67b2740dd2cc38d4. These OOF scores selected the operating point: they are not independent production precision estimates. Dev sensitivity is pair scoring, not introduction-commit or end-to-end recall. Replay and introduction estimates are reported separately. Reproduce with npm run calibrate.

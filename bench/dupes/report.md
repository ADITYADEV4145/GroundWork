# Reuse calibration report

Independent-history audit: [three pinned real repositories and full agent-reviewed BLOCK table](../real-repos/review.md). **0/14 agree (0%); the >=90% real-repository gate is not met.** No model tuning was performed on that review set.

## Method and scope

- 510 labeled pairs: 243 duplicates, 267 negatives; TypeScript/JavaScript and Python.
- 12 task families; both languages, every variant, and the array-uniq history snapshots of a family stay in one fold. Five deterministic folds (sorted family names, index modulo five). No symbol/task family appears in both training and validation in a fold.
- Full-batch logistic regression: 1800 iterations, learning rate 0.4, L2 0.002 on weights, unpenalized intercept, no class weighting. Each fold computes IDF only on its training symbols; final weights use whole-corpus IDF.
- Features retain the seven original signals and add a reuse-only binding-aware exact hash, structure×vocabulary and normalized-exact×vocabulary. The complementary hash preserves literals, external/member names and repeated local-identifier roles; it does not replace the coarse Phase 1 fingerprints. Missing/unparseable source supplies zero, never an assumed match. See diagnosis.md for all high-structure negatives and the prior failure's causal checks.
- BLOCK is the lowest distinct OOF score whose inclusive selection has nonzero true positives and >=95% precision. Equal scores are never split. WARN maximizes OOF F1 among lower thresholds (ties choose lower). Thresholds are selected on these OOF predictions, not on an independent final test set.
- Dataset/source SHA-1: `9c7a7c5a8ef11c379560ee2f70f9782ce093b9fa`. Reproduce offline with `npm run calibrate`; regenerate planted corpus with `node --import tsx scripts/calibrate-corpus.ts`.
- All labels are authored/reviewed by the coding agent from explicit domains and behavioral differences; no independent human review has occurred. Type 1 formatting, Type 2 identifier rename, Type 3 control-flow refactor, Type 4 alternate implementation. Short bodies are retained for signal evaluation, including bodies the runtime candidate filter would skip.
- Hard negatives include changed policy/boundaries, operator changes, same-name textual overloads, and same-purpose implementations with differing NaN equality. Some are deliberately indistinguishable after token normalization. Repeated template variants and overload scaffolds limit diversity despite family grouping.
- Six real history pairs from MIT-licensed sindresorhus/array-uniq are included (see corpus/unique-values/oss/LICENSE and oss-pairs.jsonl). These are compatibility implementations and their modern replacement, not six independently discovered refactorings. Both commits are pinned; `node --import tsx scripts/calibrate-mine.ts` fetches snapshots into a home-directory cache. Calibration/selftests make no network calls.
- This is a small planted-corpus operating point, NOT a claim of >=95% production precision, language-general semantic equivalence, or independent benchmark success. Selection uncertainty and the small number of task families matter; the separate real-history audit is linked above.
- No corpus sources or labels were changed to improve the score. Previous seven-feature model: 14 TP / 0 FP, 5.8% recall, Type 1 0%, Type 2 25%, Type 3 1.4%. Binding-aware hashing is a lexical approximation rather than scope-resolved equivalence; shadowing and dynamic dispatch remain limitations. Multiple feature designs have now been examined on these OOF folds; an independent evaluation set is still needed.

## Operating point

BLOCK = 0.750969663; WARN = 0.428794750.

| Selection | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| BLOCK (all signals, OOF) | 140 | 7 | 103 | 95.2% | 57.6% |
| WARN or higher (OOF) | 218 | 45 | 25 | 82.9% | 89.7% |

## By clone type at full-model BLOCK

Precision compares selected positives of this type against ALL selected negatives (the same negative pool is reused per row); recall uses only positives of this type.

| Clone type | Positive support | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Type 1 | 24 | 24 | 7 | 77.4% | 100.0% |
| Type 2 | 48 | 46 | 7 | 86.8% | 95.8% |
| Type 3 | 72 | 22 | 7 | 75.9% | 30.6% |
| Type 4 | 99 | 48 | 7 | 87.3% | 48.5% |

## Signal combinations (each trained and thresholded independently on OOF scores)

| Signals | BLOCK | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| structure | no safe threshold | 0 | 0 | 0.0% | 0.0% |
| vocabulary | 0.756369 | 81 | 3 | 96.4% | 33.3% |
| signature+name | no safe threshold | 0 | 0 | 0.0% | 0.0% |
| structure+vocabulary | 0.951980 | 12 | 0 | 100.0% | 4.9% |
| vocabulary+signature+name | 0.940101 | 20 | 1 | 95.2% | 8.2% |
| structure+vocabulary+interactions | 0.941633 | 8 | 0 | 100.0% | 3.3% |
| binding-aware | 0.951585 | 72 | 0 | 100.0% | 29.6% |
| all | 0.750970 | 140 | 7 | 95.2% | 57.6% |

## Recall by type for each signal combination

| Signals | Type 1 recall | Type 2 recall | Type 3 recall | Type 4 recall |
| --- | ---: | ---: | ---: | ---: |
| structure | 0.0% | 0.0% | 0.0% | 0.0% |
| vocabulary | 100.0% | 12.5% | 51.4% | 14.1% |
| signature+name | 0.0% | 0.0% | 0.0% | 0.0% |
| structure+vocabulary | 33.3% | 8.3% | 0.0% | 0.0% |
| vocabulary+signature+name | 0.0% | 25.0% | 5.6% | 4.0% |
| structure+vocabulary+interactions | 16.7% | 8.3% | 0.0% | 0.0% |
| binding-aware | 100.0% | 100.0% | 0.0% | 0.0% |
| all | 100.0% | 95.8% | 30.6% | 48.5% |

## False positives at BLOCK

- factorial-value-ts-edited-changed: 0.836207; Not interchangeable: the changed policy adds integers rather than multiplying them.
- parse-port-ts-renamed-changed: 0.887681; Not interchangeable: the changed policy rejects privileged ports which the original accepts.
- parse-port-py-renamed-changed: 0.852305; Not interchangeable: the changed policy rejects privileged ports which the original accepts.
- positive-total-ts-alternate-changed: 0.801503; Not interchangeable: the changed policy sums negative rather than positive values.
- positive-total-py-alternate-changed: 0.827613; Not interchangeable: the changed policy sums negative rather than positive values.
- slug-text-ts-renamed-overload: 0.762763; Same-name textual overload normalizes identifiers, whereas the other symbol trim lowercase text and replace whitespace runs with a dash.
- equal-folded-ts-renamed-changed: 0.796166; Not interchangeable: the changed policy ignores whitespace as well as case.

## First 15 missed positive examples

- active-count-ts-base-alternate: 0.383060; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-ts-format-alternate: 0.383060; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-ts-renamed-edited: 0.226543; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-ts-renamed-alternate: 0.535800; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-ts-edited-alternate: 0.383060; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-py-base-renamed: 0.673876; Count enabled boolean flags. Identifiers are consistently renamed.
- active-count-py-base-edited: 0.744914; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-py-base-alternate: 0.428795; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-py-format-renamed: 0.673876; Count enabled boolean flags. Identifiers are consistently renamed.
- active-count-py-format-edited: 0.744914; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-py-format-alternate: 0.428795; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-py-renamed-edited: 0.190870; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-py-renamed-alternate: 0.489263; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-py-edited-alternate: 0.428795; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- unique-values-ts-base-edited: 0.625521; Remove duplicate strings while retaining first occurrence order. Equivalent control-flow refactor preserves the stated domain.

## Optional meaning

See [local embedding evaluation](embeddings.md) for the separate opt-in model. The no-meaning model above is unchanged.

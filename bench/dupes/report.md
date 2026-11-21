# Reuse calibration report

## Method and scope

- 510 labeled pairs: 243 duplicates, 267 negatives; TypeScript/JavaScript and Python.
- 12 task families; both languages, every variant, and the array-uniq history snapshots of a family stay in one fold. Five deterministic folds (sorted family names, index modulo five). No symbol/task family appears in both training and validation in a fold.
- Full-batch logistic regression: 1800 iterations, learning rate 0.4, L2 0.002 on weights, unpenalized intercept, no class weighting. Each fold computes IDF only on its training symbols; final weights use whole-corpus IDF.
- BLOCK is the lowest distinct OOF score whose inclusive selection has nonzero true positives and >=95% precision. Equal scores are never split. WARN maximizes OOF F1 among lower thresholds (ties choose lower). Thresholds are selected on these OOF predictions, not on an independent final test set.
- Dataset/source SHA-1: `9c7a7c5a8ef11c379560ee2f70f9782ce093b9fa`. Reproduce offline with `npm run calibrate`; regenerate planted corpus with `node --import tsx scripts/calibrate-corpus.ts`.
- All labels are authored/reviewed by the coding agent from explicit domains and behavioral differences; no independent human review has occurred. Type 1 formatting, Type 2 identifier rename, Type 3 control-flow refactor, Type 4 alternate implementation. Short bodies are retained for signal evaluation, including bodies the runtime candidate filter would skip.
- Hard negatives include changed policy/boundaries, operator changes, same-name textual overloads, and same-purpose implementations with differing NaN equality. Some are deliberately indistinguishable after token normalization. Repeated template variants and overload scaffolds limit diversity despite family grouping.
- Six real history pairs from MIT-licensed sindresorhus/array-uniq are included (see corpus/unique-values/oss/LICENSE and oss-pairs.jsonl). These are compatibility implementations and their modern replacement, not six independently discovered refactorings. Both commits are pinned; `node --import tsx scripts/calibrate-mine.ts` fetches snapshots into a home-directory cache. Calibration/selftests make no network calls.
- This is a small planted-corpus operating point, NOT a claim of >=95% production precision, language-general semantic equivalence, or independent benchmark success. Selection uncertainty and the small number of task families matter; Phase 3's other gate checks are not implemented here.

## Operating point

BLOCK = 0.980721094; WARN = 0.393451624.

| Selection | TP | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| BLOCK (all signals, OOF) | 14 | 0 | 229 | 100.0% | 5.8% |
| WARN or higher (OOF) | 222 | 66 | 21 | 77.1% | 91.4% |

## By clone type at full-model BLOCK

Precision compares selected positives of this type against ALL selected negatives (the same negative pool is reused per row); recall uses only positives of this type.

| Clone type | Positive support | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Type 1 | 24 | 0 | 0 | 0.0% | 0.0% |
| Type 2 | 48 | 12 | 0 | 100.0% | 25.0% |
| Type 3 | 72 | 1 | 0 | 100.0% | 1.4% |
| Type 4 | 99 | 1 | 0 | 100.0% | 1.0% |

## Signal combinations (each trained and thresholded independently on OOF scores)

| Signals | BLOCK | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| structure | no safe threshold | 0 | 0 | 0.0% | 0.0% |
| vocabulary | 0.756369 | 81 | 3 | 96.4% | 33.3% |
| signature+name | no safe threshold | 0 | 0 | 0.0% | 0.0% |
| structure+vocabulary | 0.951980 | 12 | 0 | 100.0% | 4.9% |
| vocabulary+signature+name | 0.940101 | 20 | 1 | 95.2% | 8.2% |
| all | 0.980721 | 14 | 0 | 100.0% | 5.8% |

## Recall by type for each signal combination

| Signals | Type 1 recall | Type 2 recall | Type 3 recall | Type 4 recall |
| --- | ---: | ---: | ---: | ---: |
| structure | 0.0% | 0.0% | 0.0% | 0.0% |
| vocabulary | 100.0% | 12.5% | 51.4% | 14.1% |
| signature+name | 0.0% | 0.0% | 0.0% | 0.0% |
| structure+vocabulary | 33.3% | 8.3% | 0.0% | 0.0% |
| vocabulary+signature+name | 0.0% | 25.0% | 5.6% | 4.0% |
| all | 0.0% | 25.0% | 1.4% | 1.0% |

## Selected false positives / missed examples

- active-count-ts-base-format: 0.849322, dup; Count enabled boolean flags. Only formatting differs.
- active-count-ts-base-renamed: 0.351840, dup; Count enabled boolean flags. Identifiers are consistently renamed.
- active-count-ts-base-edited: 0.783646, dup; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-ts-base-alternate: 0.337535, dup; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-ts-format-renamed: 0.351840, dup; Count enabled boolean flags. Identifiers are consistently renamed.
- active-count-ts-format-edited: 0.783646, dup; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-ts-format-alternate: 0.337535, dup; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-ts-renamed-edited: 0.258609, dup; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-ts-renamed-alternate: 0.585995, dup; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-ts-edited-alternate: 0.337535, dup; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-py-base-format: 0.792210, dup; Count enabled boolean flags. Only formatting differs.
- active-count-py-base-renamed: 0.268556, dup; Count enabled boolean flags. Identifiers are consistently renamed.
- active-count-py-base-edited: 0.753737, dup; Count enabled boolean flags. Equivalent control-flow refactor preserves the stated domain.
- active-count-py-base-alternate: 0.393452, dup; Count enabled boolean flags. Different implementation computes the same result on the stated domain.
- active-count-py-format-renamed: 0.268556, dup; Count enabled boolean flags. Identifiers are consistently renamed.

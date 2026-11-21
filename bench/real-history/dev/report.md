# Real-history development evidence and diagnosis

**Step 1 only. No detector, threshold, model or final-evaluation evidence changed. Labels are agent-reviewed, not human-approved. This is not a held-out precision result or a passing acceptance gate.**

## Repositories, pins and windows

All windows are **2025-01-01 00:00:00 UTC through 2025-07-01 00:00:00 UTC (exclusive)**. Start pins are exclusive; end pins inclusive. Calendar membership uses committer timestamps and reachable non-merge history. URLs, licenses and full pins are in [repos.json](repos.json). Source clones/worktrees live outside GroundWork (default `~/work/gw-real-history`, override `GW_REAL_HISTORY_CACHE`). No upstream source is vendored here.

| Repo / license | Start | End | Non-merges mined (production-changing) |
| --- | --- | --- | ---: |
| [zod](https://github.com/colinhacks/zod.git) / MIT | `f7ad26147ba291cb3fb257545972a8e00e767470` | `1b0a5e589afd6ac913b0eddc3aa615224a1495c2` | 338 (152) |
| [pydantic](https://github.com/pydantic/pydantic.git) / MIT | `59b35de6564af0a971aae99807f0f562fa051e3e` | `42298a08b4cb999242b2ce231adda03539858567` | 216 (143) |
| [django](https://github.com/django/django.git) / BSD-3-Clause | `8d9901c961bf9d5cfa6bddddbbcebfbf487a5125` | `192bc7a7be92e20cc250907fb4083df689715679` | 482 (263) |
| [scikit-learn](https://github.com/scikit-learn/scikit-learn.git) / BSD-3-Clause | `74775cac41cb299d029417d0b06d2cd25ec8f1fc` | `6eeb16782ba417b2a00c436da0b83edadfcd7575` | 562 (245) |
| [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint.git) / MIT | `4dbf48b8eec0321babb4293a1be71b54dd00c018` | `f9bd7d86fc39eb2957de7eefdcd3ab9b6c9dc4a7` | 374 (154) |

## Mining and strict review

The production scan covers **1972 non-merge commits**, producing 1081 **unreviewed proposals**, not positives. It uses shortened bodies now calling an existing function, removed bodies with an existing call added, and two shortened bodies now using one new helper. Keywords guide inspection; they are not labels. Supplementary test mining uses refactor/parameterize/cleanup keywords. The miner uses names, not resolved bindings, so a same-spelled call is only a proposal. Pure relocations are excluded; constructors and common builtins are not guessed across unrelated classes. Raw audits and proposals remain in `*-mining.json`.

Reviewed positives are **24 pre-refactor pairs in 4 author-refactor families**, with both original bodies and the actual refactoring diff inspected. [positive-groups.json](positive-groups.json) documents the proof and action for each family; [positive-pairs.json](positive-pairs.json) stores exact parent revisions, locations, SHA-256 body hashes and post-refactor helper references.

- **21 pairs from seven scikit-learn backend predicates are ONE family**, not 21 independent events. This code is vendored upstream from array-api-compat, whose pinned `sklearn/externals/array_api_compat/LICENSE` is **MIT** (the enclosing repository is BSD-3-Clause).
- Django contributes mail-recipient helper extraction and expression-resolution consolidation, plus **one test-only assertion consolidation**. Only **23 positive pairs / 3 families** are in production paths. There are **no TS positive families** in this reviewed slice.
- **None of these 24 labels establishes safe unchanged direct-call replacement.** They prove helper extraction or extension; recipient/backend differences and missing validation must be preserved. Treating them as direct-call equivalence would recreate the detector's semantic error.
- All backend pair combinations are expanded explicitly, so family-balanced statistics are mandatory. This is enough to expose failure modes, **not enough independent positive supervision to fit or validate a BLOCK model**. Further independent TS and direct-reuse positives are needed before training.

Negatives come from built **pre-#8 permissive detector `ca55316`** BLOCK/WARN pairs on normal commits, not synthetic mutations. Normal commits exclude the mining keywords and require a production-path change. Sampling is deterministic: smallest SHA-256(`normal-v1:<commit>`), up to 12 per repo and 4 for Django/scikit-learn. The cost-based cap limits replay time. The built `checkRepository` API runs at each commit against its parent with a 120 s core timeout; no detector decisions were modified.

| Repo | Sampled commits | Unavailable | Permissive duplicate BLOCK / WARN | Replay seconds | Reviewed positive / negative pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| zod | 12 | 0 | 43 / 9 | 72.38 | 0 / 10 |
| pydantic | 12 | 0 | 7 / 10 | 189.99 | 0 / 5 |
| django | 4 | 3 | 2 / 0 | 479.47 | 3 / 2 |
| scikit-learn | 4 | 0 | 2 / 2 | 171.94 | 21 / 1 |
| typescript-eslint | 12 | 0 | 28 / 15 | 255.49 | 0 / 15 |

**Three Django runs timed out** (`reuse check timed out`); these are unavailable, never clean negatives. Across all repos there are 118 duplicate pairs in available runs. One duplicate-file WARN and two grounding BLOCKs are outside function-pair review. **33 of the 118 pairs were purposefully reviewed**: eight obvious containment errors plus short-body semantic counterexamples, generated/version-boundary cases, caller/callee stages and lifecycle opposition. Two high-structure Zod counterexamples supplement that short-body slice. Selection is intentionally diagnostic, **not representative**; the remaining 85 normal pairs and raw positive proposals are unlabelled. Do not treat them as negatives or infer population precision. [negative-reviews.json](negative-reviews.json) records every selected negative's reasoning; [pairs.md](pairs.md) is the complete labelled table with source links.

## Current signals (frozen baseline)

Every labelled pair has the current default `pairSignals`, binding-aware source extraction, model probability and BLOCK eligibility in `*-features.json`. IDF is rebuilt using **all indexed symbols at the exact pair revision**, as in CandidateIndex, not a unit/dev-pair approximation. Optional meaning is absent; no model was downloaded or changed for this diagnosis.

| Feature | Positive mean (available) | Negative mean (available) | AUC | Family-balanced AUC |
| --- | ---: | ---: | ---: | ---: |
| structure | 0.656 (24) | 0.213 (33) | 0.932 | 0.888 |
| exact | 0.125 (24) | 0.030 (33) | 0.547 | 0.611 |
| vocabulary | 0.789 (24) | 0.616 (33) | 0.790 | 0.693 |
| bindingExact | 0.000 (24) | 0.000 (33) | 0.500 | 0.500 |
| structureVocabulary | 0.520 (24) | 0.163 (33) | 0.909 | 0.832 |
| exactVocabulary | 0.100 (24) | 0.030 (33) | 0.545 | 0.603 |
| paramCount | 1.000 (24) | 0.603 (33) | 0.818 | 0.803 |
| paramNames | 0.979 (24) | 0.349 (33) | 0.885 | 0.833 |
| returnType | 0.875 (24) | 0.182 (33) | 0.847 | 0.528 |
| name | 0.476 (24) | 0.071 (33) | 0.975 | 0.935 |

On these selected pairs, **3/24 positives** pass the frozen score + policy and **2/33 negatives** do. Positive pair-scoring sensitivity is **12.5%**, **not end-to-end recall**: candidate retrieval, best-match competition, test exclusion and changed-symbol selection have not been replayed for the positive reference set. Nor is this a BLOCK precision estimate: case-control prevalence is artificial and positive helper-extraction labels do not validate a direct-call fix. Overall real-history recall is not estimable without reviewing missed opportunities in a defined history population.

## Proposed contract/side-effect separation

These are **dev-only syntactic prototypes**, not runtime features. Main contract statistics use the **49 independent compatible callable pairs** (24 positive, 25 negative), excluding the eight containment artifacts that current policy already rejects. All-pair statistics are retained in [summary.json](summary.json).

Higher similarity is oriented positive; ↓ means lower mismatch/opposition is oriented positive. AUC is the probability that a randomly selected observed positive outranks an observed negative (ties half); 0.5 means no rank separation. Family-balanced AUC gives each label/family equal weight **among observed values of that feature**, preventing 21 backend comparisons from dominating. No direction or cutoff was optimized. Means are unweighted. Empty unions, unknown return shapes, unavailable contracts and undefined usage/early-return ratios are **missing**, not a fabricated match; the table gives coverage.

| Feature | Positive mean (available) | Negative mean (available) | AUC | Family-balanced AUC |
| --- | ---: | ---: | ---: | ---: |
| reads | 0.311 (24) | 0.088 (24) | 0.905 | 0.882 |
| writes | 0.500 (1) | 0.200 (5) | 0.800 | 0.800 |
| calls | 0.749 (24) | 0.169 (25) | 0.933 | 0.912 |
| returnShape | 0.773 (22) | 0.262 (21) | 0.816 | 0.861 |
| arity | 1.000 (24) | 0.737 (25) | 0.760 | 0.750 |
| parameterUse | 0.995 (24) | 0.795 (19) | 0.792 | 0.701 |
| exceptions | 0.500 (2) | 0.000 (2) | 0.750 | 0.750 |
| validation | 0.957 (23) | 0.091 (11) | 0.933 | 0.783 |
| earlyReturns | 1.000 (22) | 0.167 (10) | 0.950 | 0.944 |
| sameFile | 1.000 (24) | 0.360 (25) | 0.820 | 0.820 |
| verbOpposition ↓ | 0.000 (24) | 0.040 (25) | 0.520 | 0.531 |
| writePresenceMismatch ↓ | 0.000 (24) | 0.160 (25) | 0.580 | 0.609 |
| literals | 0.042 (24) | 0.054 (21) | 0.472 | 0.667 |

- **Reads/writes:** member paths preserve SELF and parameter-position roles and literal subscript keys; known mutating member calls overapproximate writes. Local copies are not distinguished from observable state and aliases are unresolved. A global `set(...)` constructor is not a mutation. Compound writes are also reads.
- **Calls:** normalized syntactic callee sets, not resolved call targets. Imports, overloads and dynamic dispatch remain unverified.
- **Returns:** known literal/object-key/tuple/construction shapes only; an arbitrary returned local has unknown shape. A `call` return kind is weak evidence, not equal runtime type. Boolean comparisons are recognized; Python `a or b` is not assumed boolean.
- **Parameters:** arity excludes self/cls; usage cosine aligns positional roles, with destructuring/alias limitations.
- **Exceptions/validation/early returns:** explicit raises/throws and conditional exits only, excluding nested declarations. No inferred callee exceptions, full CFG or effect analysis.
- **Same-file and verb opposition:** simple location/verb features. All positive families were mined within one file, so same-file separation is confounded; opposition has little support, not a validated gate.
- **Literals:** SHA-256 sets of literal spellings excluding docstrings. This preserves value differences hidden by coarse STR/NUM fingerprints without copying upstream messages. Escaping and templates are syntactic, not evaluated. The datetime counterexample differs in required offset minutes despite identical normalized structure; backend/recipient positives also deliberately differ in literals, so a blanket literal-equality veto would reject valid helper extraction.

## Diagnosis and recommended model design

See [method.md](method.md) for causal evidence, rejected mining shortcuts, the proposed action-aware architecture, limitations and exact reproduction commands. **Do not train a new BLOCK classifier from these four positive families.** Keep runtime policy/models frozen, enlarge independent positive supervision (especially TS and safe direct reuse), then fit/evaluate by family/repo, not random pair splits. Reserve got/click/pytest and their final windows until after code freeze. This handoff neither replays nor edits that evidence, and does not claim the ≥90% / ≥20 held-out BLOCK goal has been met.

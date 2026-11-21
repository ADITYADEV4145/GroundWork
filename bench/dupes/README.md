# Duplicate calibration corpus

`labeled.jsonl` contains 510 unique, unordered pairs: 504 planted pairs and six real-history pairs. References are relative to this directory. Each label has a one-line behavioral rationale. The coding agent authored/reviewed these labels; **independent human label review is still outstanding**.

## Reproduction

```sh
# Optional networked provenance refresh; clones outside this repo:
node --import tsx scripts/calibrate-mine.ts
# Rebuild committed planted source files and combine labels:
node --import tsx scripts/calibrate-corpus.ts
# Offline training, grouped OOF evaluation and report:
npm run calibrate
npm run selftest -- --through 3 --quick
```

The mining cache defaults to `~/work/array-uniq-cache`; override with `GW_OSS_CACHE`. Snapshots and their MIT license are committed, so calibration never fetches code. Provenance and exact commits are attached to the six history labels in `oss-pairs.jsonl`.

## Domains and labels

Twelve tasks each have TypeScript and Python implementations. Every task has five equivalent variants (base, formatting-only, identifier-renamed, control-flow edited, alternate algorithm) and two negatives (changed behavior and a same-name textual overload in a separate module). All 21 unordered pairs per language are labeled, not randomly sampled; clones are typed by the strongest transformation between variants. The `overload` modules model separate input-domain implementations rather than bodyless TypeScript declarations, which cannot be fingerprinted. The same-name policy variants include off-by-one bounds, changed operators and null/empty distinctions. Renamed-versus-policy pairs provide similar-structure/different-purpose negatives.

Assume ordinary finite numeric inputs, dense arrays/lists, ordered bounds, positive integer chunk sizes, nonnegative integer factorial arguments, and ASCII case-folding strings, as appropriate to the documented task. `parsePort` has its explicit range/error domain. Slug implementations normalize whitespace runs. These domains deliberately exclude non-finite arithmetic and JavaScript prototype/metaprogramming concerns; equivalence is not asserted outside them.

`array-uniq` snapshots add stable deduplication with Set versus filter/iteration/spread and hard negatives involving `NaN`: `indexOf` retains repeated NaNs but Set uses SameValueZero. They are historical compatibility variants and a later replacement, not proof that maintainers removed accidental duplicates. Dense arrays and modern Set semantics are assumed for positive history labels. All snapshots stay in the `unique-values` fold, together with the planted deduplication family.

Cross-validation holds out entire task families, including both languages and history snapshots. The report calls out template repetition, short bodies bypassing runtime candidate filters, threshold selection on OOF scores, and low recall. This evaluates the pair scorer, not retrieval recall or production blocking precision. Do not treat passing this one selftest check as completion of all Phase 3 gates.

# Real-history results — gate deferred

Agent-reviewed, not human-approved. Frozen [REUSE-or-EXTEND standard](../real-history/review-standard.md); contract model fitted only on development + planted pairs before reserved replay. All eligible non-merge commits in pinned UTC months were checked: original + three held-out months per repo, **250 commits total (222 held-out)**; no sampling.

| Repository | Replay commits | Pre-fix BLOCKs | Agree / BLOCK | After test filter |
| --- | ---: | ---: | --- | ---: |
| got | 14 | 0 | undefined | 0 |
| Click | 73 | 0 | undefined | 0 |
| pytest | 163 | 3 | 0/3 | 0 |
| **Total** | **250** | **3** | **0/3 (0%; Wilson 95% 0–56.1%)** | **0** |

All three held-out BLOCKs were pytest regression tests. The missing `testing/`, `spec/`, `specs/` defaults were fixed **post-replay** as spec noise filtering; the last column is an analytical exclusion, not a new replay. Zero remaining BLOCKs establish no precision/recall or acceptance claim. No model/threshold tuning followed replay.

Historical family-disjoint OOF calibration: **73 TP / 2 FP, 97.33% precision, 26.94% recall** combined; planted **69 TP / 1 FP, 98.57% precision, 28.40% recall**. Planted clone recall: Type 1 **24/24**, Type 2 **42/48**, Type 3 **3/72**, Type 4 **0/99**. These are calibration results, not production estimates; the shipped selftest now checks frozen-model planted regression, not reproduction of the removed mixed-corpus fit.

Development search: **6,166 commits**, **8 consolidation families** (3 TypeScript), **0 unchanged direct-reuse families**. No committed copies of external source or bulky evidence datasets are retained. Pins, frozen standard, models and mining/review/calibration scripts remain; generated records and manual review labels must be regenerated before reproducing the full analysis.

**Decision:** real-history gate work is stopped. Acceptance needs the **Benchmark v2 agent run, deferred**. BLOCK remains **strict-profile-only** for Stop; default **standard stays warn-only**. The non-quick history selftest reports **“skipped: evidence not stored; gate deferred to Benchmark v2”**—not passing evidence.

Reproduction entry points: `scripts/real-history-dev.ts`, `scripts/real-history-diagnose.ts`, `scripts/calibrate-contracts.ts`, `scripts/setup-real-repos.ts`, `scripts/replay-real-repos.ts`, `scripts/mine-heldout-history.ts` and the renderers. Manifests: `../real-history/dev/repos.json`, `repos.json`, `heldout-repos.json`, `new-1-repos.json`, `new-2-repos.json`. Clones stay in external caches; human review waits for Benchmark v2.

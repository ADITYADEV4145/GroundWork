# Step-three detector freeze

The review standard was committed separately in 0138d34 before fitting or reserved replay. This document, the detector/models and both new manifest files are committed before any step-three replay. Existing original and held-out manifests stay unchanged. New months are got August/September 2024 and Click/pytest September/October 2025; all eligible non-merge commits will run without finding-dependent sampling.

Calibration is in calibration.md/json. Only the planted set and dev evidence were used. Two training-weight regimes were tried before replay: all-family-unit weighting (100% planted precision but only 8.2% recall) and the selected original planted population with dev-family-unit weighting (98.57% planted precision, 28.40% recall). The latter retains more planted clone-type coverage. Combined OOF precision is 97.33%; dev-only pair precision is only 80% (4/5), an important warning, not a passing real-history result. There are still no direct-reuse positive dev families. Thresholds are frozen at BLOCK 0.7550627041535564 and WARN 0.3891014490985248.

The normal full typecheck/test/build/quick-selftest chain passed: 20 files / 193 tests; selftest through phase 4 PASS. Non-quick latency used the existing built Stop gate, with a strict-profile fixture so every sample had to really block (standard runs the same detector but only reports warnings):

    built Stop: p50 179.23 ms, p95 215.84 ms over 35 fresh processes; warm index/compile cache, startup included; every sample blocked

No extra speedup or relaxed test was needed. No schema or extractor change: contract metadata is computed transiently alongside binding hashes, not added to stored extraction output. Archived frozen-model.json and frozen-signals.ts.txt preserve step-two signal provenance without relabeling or regenerating its evidence.

Do not change detector features, coefficients, thresholds or retrieval after replay starts, even if the agreement/support gate fails. Later commits may add evidence, recall analysis, reporting and stricter evidence validation only.

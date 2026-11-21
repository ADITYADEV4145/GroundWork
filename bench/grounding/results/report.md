# Benchmark v3 — grounding

Task-set SHA256: `6bcaa30b3acd42f0557c6c8ec564433ef1d2f0cbed9fdb8873c059bd190409d1`

Agents: baseline **Devin (child sessions, default settings)**; Groundwork **Devin (child sessions, default settings)**.

95% percentile bootstrap intervals: 10,000 seeded resamples (seed 3107), sampling the 15 tasks with replacement. Differences pair the same tasks (Groundwork minus baseline). These intervals cover task variation, not independent agent/model reruns. Success uses Wilson intervals; the no-drop gate compares observed counts, not a statistical noninferiority claim.

| Arm | Success | Rate | Wilson 95% |
|---|---:|---:|---|
| baseline | 15/15 | 1.000 | [0.796, 1.000] |
| groundwork | 15/15 | 1.000 | [0.796, 1.000] |

| Metric | Arm/difference | Total (95% CI) | Mean (95% CI) |
|---|---|---|---|
| wrongCallsFinal | baseline | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| wrongCallsFinal | groundwork | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| wrongCallsFinal | pairedDifference | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| hiddenFailuresCaused | baseline | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| hiddenFailuresCaused | groundwork | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| hiddenFailuresCaused | pairedDifference | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| fixTokensProxy | baseline | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| fixTokensProxy | groundwork | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| fixTokensProxy | pairedDifference | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| success | pairedDifference | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |

Observed no success drop: **PASS**.

Fix tokens are a chars/4 proxy: source fix-commit diffs plus matching recorded grounding feedback, not billed/model tokens. Missing intermediate commits/feedback and conservative static/dynamic attribution cause undercounting. See README.md and per-task evidence before interpreting differences.

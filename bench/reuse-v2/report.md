# Benchmark v2

| Arm | n | Duplicates / labeled | Duplicate rate (Wilson 95%) | Task success (Wilson 95%) | Mean ACUs (n) | GW BLOCK / WARN | GW unavailable |
| --- | ---: | ---: | --- | --- | --- | ---: | ---: |
| baseline | 20 | 14/20 | 70.0% [48.1%, 85.5%] | 17/20: 85.0% [64.0%, 94.8%] | n/a (0) | 0 / 23 | 0 |
| groundwork | 20 | 0/20 | 0.0% [0.0%, 16.1%] | 17/20: 85.0% [64.0%, 94.8%] | n/a (0) | 0 / 0 | 0 |

Reviewed label overrides: baseline 20/20; groundwork 20/20. See labels.jsonl for attribution; agent review is not independent human review.

Differences are baseline − groundwork (percentage points), with independent-proportions Newcombe 95% intervals. These are descriptive intervals, not paired-task inference.

- duplicates: 70.0 pp; 95% CI [42.8 pp, 85.5 pp]
- success: 0.0 pp; 95% CI [-23.2 pp, 23.2 pp]

Duplicate counts are per-run binary labels, not counts of every duplicated function. Unknown labels are excluded from duplicate-rate denominators, never treated as clean. Apply/execution failures count as task failures. GW counts cover available checks only; unavailable checks are not zero-finding evidence.

Automated reuse labels are static heuristics, not semantic judgments. Decisions supplied by agents are not trusted as evidence. Human labels in labels.jsonl take precedence. ACUs are reported as ACUs, not tokens. Missing arms/tasks and small samples are not a completed 20-task experiment.

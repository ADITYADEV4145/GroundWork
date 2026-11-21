# Frozen real-history review standard — step 3

Frozen before step-3 detector fitting or replay. All automated reviews are
agent-reviewed, not human approval.

## Meaning of BLOCK

A BLOCK claims: **duplicate of X: REUSE or EXTEND X**. It is not limited to
unchanged direct substitution.

- **agree**: a reviewer would reasonably ask the author to call X as-is, or
  extend/parameterize X instead of keeping both implementations. Genuine
  extract/extend consolidations count.
- **disagree**: contracts or behaviors really differ, including different
  types/fields, opposite operations, and coincidental structure. Shared words
  or boilerplate alone do not justify consolidation.
- Unavailable source/replay is not agreement or a clean negative. Every BLOCK
  needs both sites inspected and a one-line justification.

Historical strict-substitutability labels remain intact. Add separate
reuse-or-extend verdict and reason columns; never overwrite the earlier labels.
The same standard applies to historical original, historical held-out, and new
frozen-detector captures.

## Training and freeze boundary

Fit only on bench/real-history/dev and the planted labelled corpus. Retain #8's
independence, compatible-kind, and structure >= 0.5 or exact safeguards.
Commit detector/features/models and new replay pins before replay. Do not tune
after observing step-3 reserved-repository output, including WARNs. Report a
failed gate honestly; zero or low BLOCK support is not acceptance evidence.

## Evaluation protocol

Re-run the existing original and held-out months, plus these two consecutive
new months (UTC committer dates, end exclusive), selected before inspection:

| Repository | New month 1 | New month 2 |
| --- | --- | --- |
| got | August 2024 | September 2024 |
| click | September 2025 | October 2025 |
| pytest | September 2025 | October 2025 |

Pin boundaries before replay; check all eligible non-merge commits without
finding-dependent sampling. Historical held-out plus new months form the
held-out denominator. Report original-window results separately; the gate
requires held-out agreement >= 90%, and does not pass vacuously on zero BLOCKs.
Report agree/total and a two-sided 95% Wilson interval; intervals do not correct
for correlated findings or replace human review. Aim for at least 20 held-out
BLOCKs, explicitly reporting a shortfall.

Review every BLOCK and ten deterministic WARNs per repository (or every WARN
if fewer exist). Store source links, proposed X, one-line claim and an empty
human agree/disagree column in bench/real-repos/human-review.md.

Recall is conditional on independently established positives: estimate detection
at the introduction of each later-consolidated dev family where introduction can
be reconstructed, and report real consolidation positives discovered in the
held-out windows. Do not call sensitivity over selected pairs end-to-end recall,
do not infer absent positives from absent BLOCKs, and state unavailable
introduction histories or unexhausted positive mining explicitly.

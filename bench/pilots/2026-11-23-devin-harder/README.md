# Exploratory pilot on harder tasks, 2026-11-23

Sixteen Devin sessions, started with the Fable 5.2 agent mode selected: eight DefectsAtDone tasks, each once in a `native` and once in a `groundwork` arm. It is not preregistered, has one run per arm, and supports no claim.

GroundWork package given to the `groundwork` arm: built from `f402ca9b363425813667686304472cf7ace49cf3`, the same package as the first pilot. Task workspaces were cut from this branch at `411de67`.

## What ran

- Real past failures: `itertools-numeric-range-negative-slice`, `itertools-running-min-stability`, `itertools-peekable-reverse-slice`, `mux-query-mismatch-status`, `mux-subrouter-method-status`.
- Fixture tasks: `ledger-late-fee-options`, `route-weight-unit`, `ledger-card-on-file`.

The exact prompts are in `prompts/`.

## Results

| Tasks | Native | GroundWork |
| --- | --- | --- |
| 5 real past failures | 5/5 hidden checks pass, 0 defects | 5/5 pass, 0 defects |
| 3 fixture tasks | 3/3 pass, 1 defect counted (a grader false positive, below) | 3/3 pass, 0 defects |

The pilot shows no difference between arms. `defects/grades.json` is the grading as first produced.

## Grader false positive

`route-weight-unit`, `native`: the grader counted one wrong-argument defect at `tests/test_labels.py:34`. The line is `format_weight(12.34)` inside `with self.assertRaises(TypeError):`, a test that the new argument is required. That is not a defect. The grader now skips calls a Python test expects to raise; `defects/route-weight-unit.native.regraded.json` is the same workspace graded after that fix (0 defects). Both records are kept.

## Limits

- Everything in the first pilot's limits applies: no hooks or MCP connection (the `groundwork` arm used the `gw` command line), the model is the selected mode and is not confirmed at run time, usage was not measured, the harness was not used, and transcripts were not captured.
- The five real failures are fixed in public upstream repositories. Sessions were told not to look online; this was not enforced, and the agent may know the fixes from training.
- After the sessions received their prompts, review fixes changed two of these tasks: the prompt of `itertools-running-min-stability` was narrowed to totally ordered windows, and the hidden check of `route-weight-unit` now also requires the one-argument call to fail. Grading used the changed check; both arms passed it.

# Exploratory pilot, 2026-11-23

Sixteen Devin sessions, started with the Fable 5.2 agent mode selected, run to learn what a session costs and whether the tasks separate the arms. It is not preregistered, has one run per arm, and supports no claim.

GroundWork revision: `f402ca9b363425813667686304472cf7ace49cf3`, plus the uncommitted Go fixture for `stock-discount-options`.

## What ran

- DefectsAtDone: `ledger-invoice-slug`, `ledger-currency-format`, `route-depot-name`, `route-pickup-then-dropoff` (two sessions per arm, one per turn) and `stock-discount-options`, each in a `native` and a `groundwork` arm. 12 sessions.
- Navigation and long-horizon suites: one session per arm each. 4 sessions.

The exact prompts are in `prompts/`.

## Results

DefectsAtDone (`defects/grades.json`): every session in both arms had 0 defects and passed the hidden check. The pilot shows no difference between arms on these tasks.

Speed suites (`speed/`, raw captures as exported):

| Suite | Arm | Success | Est. tool-output tokens per task (bytes / 4) | Wall time per task |
| --- | --- | ---: | ---: | ---: |
| Navigation | baseline | 30/30 | 164.3 | 5.9 s |
| Navigation | groundwork | 30/30 | 128.1 | 6.9 s |
| Long-horizon | baseline | 10/10 | 151.0 | 10.3 s |
| Long-horizon | groundwork | 10/10 | 158.4 | 9.9 s |

With one session per arm these differences are not evidence of anything.

## Limits

- Devin has no GroundWork hooks or MCP connection. The `groundwork` DefectsAtDone arm installed the package and was told to use the `gw` command line and run `gw check` before finishing. This is not the arm defined in `arms.json`.
- Fable 5.2 is the mode that was selected when the sessions were started. Devin does not confirm the model at run time, and the captures record agent `Devin normal` with no model.
- Usage was not measured: Devin reported 0.0 ACUs for all sessions when read after they finished. No provider token counts exist.
- The stable-protocol grader rejects fewer than 16 sessions per arm. The speed table was produced by grading copies of the captures with the `protocol` field removed; the copies and reports were then deleted. The files in `speed/` are the unmodified exports.
- The DefectsAtDone harness was not used; workspaces were sent to the sessions as archives and graded with the suite's `grade` function on return. Transcripts were not captured.
- One `groundwork` session (`stock-discount-options`) reported three duplicate warnings from `gw check` (p 0.51 to 0.67) that it judged false positives and left unfixed.
- The speed suites run on GroundWork's own repository and public pinned repositories; sessions were told not to open the task or evidence files, which was not enforced.

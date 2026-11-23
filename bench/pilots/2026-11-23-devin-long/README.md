# Exploratory pilot on long multi-step tasks, 2026-11-23

Eighteen Devin sessions, started with the Fable 5.2 agent mode selected: three three-step tasks on a pinned werkzeug commit (`0f43c6e`), each once in a `native` and once in a `groundwork` arm. Every step ran in a new session that received the previous step's workspace and no conversation history. It is not preregistered, has one run per arm, and supports no claim.

GroundWork package given to the `groundwork` arm: built from `f402ca9b363425813667686304472cf7ace49cf3`, the same package as the earlier pilots.

## What ran

`werkzeug-prefer-then-negotiate`, `werkzeug-validators-then-revalidate`, `werkzeug-download-name-then-headers`. The exact prompts are in `prompts/`, the session of each step in `sessions.json`. Only the workspace after the third step was graded.

## Results

| Task | Native | GroundWork |
| --- | --- | --- |
| `werkzeug-prefer-then-negotiate` | hidden check passes, 1 defect counted (below) | passes, 0 defects |
| `werkzeug-validators-then-revalidate` | passes, 0 defects | passes, 0 defects |
| `werkzeug-download-name-then-headers` | passes, 0 defects | passes, 0 defects |

`defects/grades.json` is the grading as produced.

## The one counted defect

`werkzeug-prefer-then-negotiate`, `native`: the grader counted one missed helper, because the added code does not use `parse_dict_header`, the helper the task names as the one to reuse. The `native` workspace parses the header with `parse_list_header` and `unquote_header_value` from the same module instead; the `groundwork` workspace calls `parse_dict_header`. Whether that is a defect is debatable: the `native` code reuses existing helpers and did not copy one, and it differs in behaviour only outside what the hidden check tests (it drops `;` parameters and keeps the first of a repeated preference, where `parse_dict_header` keeps the parameters in the value and the last). The count is kept as graded and is one observation in one run.

## Limits

- Everything in the earlier pilots' limits applies: no hooks or MCP connection (the `groundwork` arm used the `gw` command line), the model is the selected mode and is not confirmed at run time, the harness was not used, and transcripts were not captured. Devin reported 0.0 ACUs for every session, so usage was not measured.
- Three tasks and one repository. werkzeug is public and widely used, so the agent knows its helpers from training.
- Two steps were dispatched twice by a script error (`sessions.json`, `_superseded`). The extra sessions were terminated without their output being read and are not graded.
- The tasks add new files; none changes existing code, so stale callers and changed signatures are not exercised.

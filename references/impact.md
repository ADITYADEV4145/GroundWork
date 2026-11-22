# Change impact

`gw impact [--base ref] [--depth 1..5] [--json]` and MCP `change_impact` list
changed/deleted symbols, callers with confidence and depth, and reaching tests.
Callers already changed are marked; observed session reads/edits and test commands
mark evidence coverage, not correctness or passing tests. CLI uses GW_SESSION_ID;
MCP accepts sessionId. Missing/expired evidence means unknown, never proof a file
was read or a test run. Direct test-runner commands and known npm test scripts are
recognized conservatively; shell pipelines, aliases and arbitrary wrappers aren't.

Risk is high for exported/public symbols with a changed signature or deletion and
an unchanged caller outside changed files; medium for other symbols with callers;
low otherwise. Public methods exclude underscore/private/protected names.
Body-only return-shape changes without declared signature changes can be medium.
Renames appear as deletion plus addition. Deleted symbols use base-file extraction;
fallback caller names remain explicitly uncertain, including potential collisions.

The index is primary. No TypeScript references augmentation is enabled: compiler
availability does not change the fast path. Calls/imports are traversed to the
configured depth (default 2), including tests importing a changed file. Commands
are suggested only when pytest/vitest/jest can be inferred.

`complete: true` means no further lookup changes the indexed static answer **for
this snapshot and scope**, not that all runtime dependencies are known. It requires
hash-fresh discovered/indexed files, parsed current/base files, no dynamic signals,
no unresolved/name-only calls or local imports, no ambiguous declarations, and no
truncated caller/import frontier. These checks are conservative across the indexed
repository, so unrelated ambiguity can keep the flag false. A new edit invalidates
the answer. Budget-truncated text reports complete:false; JSON retains the full
graph report. Missing index coverage and timeouts are listed as incomplete reasons.

Stop emits at most one budgeted context line per session/distinct impact set when
high/medium symbols have unopened unchanged callers or tests not observed running.
It never blocks in any profile. A subprocess hard deadline includes refresh;
errors/timeouts fail open. Cursor cannot show nonblocking Stop context, so it stays
silent there rather than sending a blocking followup.

Config: `impact: { enabled: true, stopGate: true, depth: 2, budgetTokens: 400,
timeoutMs: 1500 }`. Minimal profile disables it. Explicit CLI/MCP output is budgeted;
`--json` is full fidelity. The benchmark in bench/impact is deterministic tooling,
not an agent run; the planted-caller agent-success gate remains pending.

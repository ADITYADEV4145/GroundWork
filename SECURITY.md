# Security

Groundwork runs entirely on your machine. It makes no network calls and has no telemetry. Its state lives in `.groundwork/` inside your repository.

## What the hooks do

`gw setup` (or the Claude Code plugin) registers `gw hook <agent> <event>` commands with your agent:

| Event | What Groundwork does |
| --- | --- |
| before Read / shell commands | reads the local index and may answer with a shorter result or a note; never runs the command itself |
| after Read / Edit / Write | refreshes the index for the edited file and may add a short note for the agent |
| before compaction | prints a summary of what the session already learned |
| stop | may report duplicates or invented calls (blocking only in the `strict` profile) |

Hooks run with your user permissions, like any other hook command. Every file `gw setup` touches is listed before it writes, and `gw setup --remove` removes exactly those entries.

## Fail-open design

A hook that errors, times out (2 s budget) or finds the index locked exits 0 and allows the action. Cursor permission hooks always print `{"permission":"allow"}` in that case, because Cursor treats a missing answer as a block. Errors go to `.groundwork/logs/groundwork.log`.

## Auditing

- `gw setup --dry-run` shows the planned changes.
- `gw doctor` checks the runtime, grammars and index.
- The hook entry point is `src/hooks/run.ts`; handlers are listed in `src/hooks/handlers/index.ts`.

## Reporting a vulnerability

Open a private security advisory on GitHub for this repository.

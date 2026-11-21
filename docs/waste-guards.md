# Waste guards

All processing stays local. Hooks fail open, and guards do nothing without a
session ID. Settings live under `guards` in `.groundwork/config.json`:

```json
{
  "guards": {
    "repeatCommand": { "enabled": true, "exempt": ["date", "curl", "git fetch"] },
    "outputTrimmer": { "enabled": true },
    "explorationHint": { "enabled": true, "threshold": 12 },
    "sessionSummary": false
  }
}
```

Repeat-command checks normalize whitespace and compare HEAD, git status and dirty
or untracked non-ignored contents. Different working directories are distinct.
Files above 1 MiB use size, mtime and ctime instead of content hashing. Unknown
fingerprints, excessive changes and git failures always allow. Exemptions prefix-match; include time/network-dependent commands in your
list (the defaults also include git pull, wget, npm view and gh).

To rerun intentionally, use `GW_FORCE=1 npm test` or `npm test # gw:force`.
Forces are counted. Claude input rewrites strip these markers. Other agents
retain their native input: the prefix is an environment assignment, the suffix
is a shell comment. Do not use markers inside quoted arguments.

Claude PreToolUse rewrites recognized noisy Bash commands to the invoking
`gw run -- '<original command>'`. PostToolUse cannot replace output. Codex and
Cursor are not rewritten; use `gw run` explicitly there.

`gw run -- npm test` buffers stdout and stderr into a full local log under
`.groundwork/logs/run-*.log`, prints failures and three lines of context, the final
summary, and the log path, and returns the original exit code. Output under 60
lines is unchanged (apart from the appended log path). Tool-specific parsers
cover pytest, vitest, jest, tsc, eslint, ruff and package installs, with a generic
failure-pattern safety net. Retaining every failure takes priority over a hard
output budget: exceptionally failure-heavy output may remain long. Shell syntax
can be passed as one quoted argument, e.g. `gw run -- 'npm test && npm run build'`.
This is for noninteractive commands; no output is streamed while they run.

After more than 12 distinct file reads without an edit, the exploration guard
suggests `repo_map` / `find_code` once. Edit, Write, MultiEdit and NotebookEdit
reset the count. It never blocks. The optional stop summary is informational and
respects `stop_hook_active`.

## Measured savings

`gw report` selects the latest session; `gw report --session <id>` selects one;
`gw report --all` aggregates. Every command supports `--json` (put it before
`run --` for `gw run`). Reports include per-guard savings, duplicates prevented,
invented calls caught, forces, ignores and force rate (forces divided by forces
plus interventions).

Estimates use **UTF-8 bytes / 4**, recorded as `bytes/4`, not model tokenization.
The repeat guard credits the previous output bytes; the trimmer credits only the
positive difference between full output and printed output including the log
path. Exploration hints make no unmeasured token-saving claims.

Waste state lives only in the top-level `guards` key of
`.groundwork/sessions/<session-id>.json`. Locked read/modify/atomic-rename writes
preserve navigation and unknown keys. Other feature streams can use
`bumpCounter(root, sessionId, 'duplicatesPrevented' | 'inventedCallsCaught' |
'ignores', amount)` from `src/guards/ledger.ts` without knowing its storage shape.

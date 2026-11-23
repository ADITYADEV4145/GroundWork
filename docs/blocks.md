# Blocks and how to clear them

Every way Groundwork can stop or warn an agent, what it means, and what to do. Start with `gw doctor`; `gw view` shows where the last session was blocked on the module graph, and `gw check --json` gives the full findings.

Blocking happens only in clients with hooks (Claude Code, Codex, Cursor). The Stop gate blocks in the `strict` profile; in `standard` the same findings are reported without holding the agent. The same set of findings holds a session once: if the agent stops again without changing anything, it is let through.

## Stop gate findings

| Finding | Meaning | Fix | If it is wrong |
| --- | --- | --- | --- |
| `duplicate` | A new function or method does the same thing as an existing one. Blocks when the match is strong, warns otherwise. | Call the existing symbol named in the finding and delete the copy. | Put a `groundwork: allow-duplicate <specific reason>` comment on the new symbol. |
| `duplicate-file` | A new file is mostly a copy of an existing file. Blocks when most of its symbols are blocking duplicates. | Import from the existing file, or move it instead of copying. | Same allow comment on the copied symbols. |
| `duplicate-constant` | A new literal repeats a named constant that already exists. Blocks. | Use the constant named in the finding. | The allow comment on the enclosing symbol exempts it. |
| `dead-after-change` | The change moved every caller of an existing symbol to a new one and left the old one unused. Blocks. | Delete the old symbol, as the finding says, or keep calling it. | Use the `standard` profile if you want this reported without holding the agent. |
| `invalid-allow` | An allow comment has no real reason (for example "needed"). It is a warning, and the duplicate it was meant to exempt still blocks. | Give at least three meaningful words naming the concrete constraint, or remove the comment and reuse the existing code. | There is no override; the reason is the override. |
| `grounding` (`missing-module`, `unknown-export`, `unknown-member`, `unknown-keyword`, `arity`) | The code imports, calls or passes something the index cannot find. TypeScript, JavaScript and Python only. | Use the suggested name, or create the missing symbol. | If the target lives outside the index (a package, a generated file), add it to `grounding.exclude`; `gw stats` shows what is indexed. |
| `grounding` (`type`) | The type checker reports a new error on a changed line. | Fix the error; the message is the compiler's. | Errors already in the base commit never block. To switch type checks off, set `types.enabled` to `false`. |

## Read guard (Claude Code, Cursor)

| Block | Meaning | Fix |
| --- | --- | --- |
| "Unchanged since Read step N" | The agent asked to re-read a file range it already has, and the file has not changed. | Use `outline` and `read_symbol` for the part needed, or repeat the exact Read once to force it. |

## Waste guards

| Block | Meaning | Fix |
| --- | --- | --- |
| "Same command, nothing changed since step N" | The same shell command was run again with no change to the working tree. | Change something first, or rerun with `GW_FORCE=1 <cmd>` or `<cmd> # gw:force`. Exempt a command under `guards.repeatCommand.exempt`. See [waste guards](waste-guards.md). |

## When a block does not appear

| Symptom | Cause | Fix |
| --- | --- | --- |
| No block in Gemini CLI, Copilot, Zed, Kiro or OpenCode | These clients are MCP-only. | Run `gw check` before a commit or in CI. |
| Findings shown but the agent was not held | The profile is `standard`. | `gw install --profile strict`. |
| No findings in Cursor | Cursor's stop hook reports only in `strict`. | `gw install --profile strict`, or run `gw check`. |
| No hooks at all | The client has not approved them, or `gw` is not on `PATH`. | `gw doctor` names the client and the missing piece. |
| A block was expected on a second stop | The same findings hold a session once. | Run `gw check` to see them again. |

Hooks fail open: if Groundwork errors or times out, the agent continues and the error goes to `.groundwork/logs/groundwork.log`.

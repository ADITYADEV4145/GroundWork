# Troubleshooting

Start with `gw doctor`. It checks the Node version, the SQLite backend, the grammars, the languages and type backends, the index, and each client's hooks and MCP entry.

| Symptom | Cause and fix |
| --- | --- |
| Hooks never fire in Codex | Project hooks need trust. Open `/hooks` in Codex and approve the Groundwork entries. |
| Cursor blocks every Read/Shell | A permission hook printed nothing or bad JSON. Run `echo '{}' \| gw hook cursor pre_tool`; it must print `{"permission":"allow"}`. If `gw` is not on PATH, rerun `gw setup --command "npx -y groundwork-agent"`. |
| Cursor does not gate on edits | This is intended: Cursor's `afterFileEdit` cannot block, so Groundwork gates on `stop`. |
| Cursor shows no Stop warnings | Cursor's `stop` hook can only send a follow-up message, which would block. So in the `standard` profile, Cursor shows no warnings. Run `gw check` yourself, or use `--profile strict` to get the blocking gate. |
| Claude Code does not list the MCP tools | Approve the `groundwork` server when Claude asks about `.mcp.json`, or run `/mcp`. |
| `index locked` in logs | Another `gw` process is writing. Hooks wait for a short time and then allow the action; run `gw refresh` once the other process exits. |
| Results look stale after a branch switch | Run `gw refresh`. `gw index` rebuilds from scratch. |
| Schema or version mismatch | After an upgrade, Groundwork rebuilds the index automatically on the next run. |
| The Stop gate keeps holding back the same work | Each set of findings blocks only once per session. If a finding is wrong, mark the code `// groundwork: allow-duplicate <specific reason>`, or use `"profile": "standard"` so findings are only warnings. |
| A grounding note names a function that does exist | It lives outside the index (a package, a generated file, an excluded glob). Check `gw stats`, then add it to the index or to `grounding.exclude`. |
| A waste guard keeps firing on purpose | Rerun with `GW_FORCE=1 <cmd>` or `<cmd> # gw:force`, or turn that guard off in `.groundwork/config.json`. |
| No block in Gemini CLI, Copilot, Zed, Kiro or OpenCode | These clients get the MCP tools and the skill only; nothing can be blocked there. Run `gw check` before a commit or in CI. |
| `gw doctor` says a client is incomplete or `gw` is not on PATH | Run `gw install`, or `gw install --command "npx -y groundwork-agent"` when there is no global install. |
| Too many interventions overall | Run `gw setup --profile minimal` (navigation only), then turn guards back on one at a time. |

Hook errors go to `.groundwork/logs/groundwork.log` and never block the agent. `gw report` summarises what the guards did in a session.

To remove Groundwork completely, run `gw setup --remove` and then delete `.groundwork/`.

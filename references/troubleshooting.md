# Troubleshooting

Start with `gw doctor`: it checks the Node version, the SQLite backend, grammars and the index.

| Symptom | Cause and fix |
| --- | --- |
| Hooks never fire in Codex | Project hooks need trust. Open `/hooks` in Codex and approve the Groundwork entries. |
| Cursor blocks every Read/Shell | A permission hook printed nothing or bad JSON. Run `echo '{}' \| gw hook cursor pre_tool`: it must print `{"permission":"allow"}`. If `gw` is not on PATH, rerun `gw setup --command "npx -y groundwork-agent"`. |
| Claude Code does not list the MCP tools | Approve the `groundwork` server when Claude asks about `.mcp.json`, or run `/mcp`. |
| `index locked` in logs | Another `gw` process is writing. Hooks wait at most a short budget and then allow the action; run `gw refresh` once the other process exits. |
| Results look stale after a branch switch | Run `gw refresh`; `gw index` rebuilds from scratch. |
| Schema or version mismatch | Upgrading Groundwork rebuilds the index automatically on the next run. |
| A guard keeps firing on purpose-built code | Pass `force: true` once with a reason, or switch off that guard in `.groundwork/config.json`. |

Hook errors are logged to `.groundwork/logs/groundwork.log` and never block the agent.

To remove Groundwork completely, run `gw setup --remove`, then delete `.groundwork/`.

# Clients

`gw install` detects the clients on your machine (a binary on `PATH`, a config directory in your home, or a project config already in the repository) and wires Groundwork into each one. Every file it writes is inside the repository, and `gw install --remove` restores what was there before.

```sh
gw install                       # detected clients
gw install --client zed,kiro     # named clients
gw install --client all          # all eight
gw install --dry-run             # show the plan only
gw install --profile strict      # make the Stop gate block in clients with hooks
gw install --remove              # undo
gw doctor                        # check each client afterwards
```

There are two levels of support. Groundwork can only stop an agent in a client that runs hooks; in the others it offers tools and the skill, and the agent decides whether to use them.

| Client | Support | What Groundwork enforces | Files written |
| --- | --- | --- | --- |
| Claude Code | hooks + MCP | Read guard, waste guards, grounding notes after edits, Stop gate. The Stop gate blocks in the `strict` profile and reports in `standard`. | `.claude/settings.json`, `.mcp.json` |
| Codex | hooks + MCP + skill | Waste guards, grounding notes after edits, Stop gate (blocks in `strict`). No read guard. | `.codex/hooks.json`, `.codex/config.toml`, `.agents/skills/groundwork/` |
| Cursor | hooks + MCP | Read guard, waste guards, Stop gate in `strict` only (Cursor's stop hook cannot warn without holding the agent). | `.cursor/hooks.json`, `.cursor/mcp.json` |
| Gemini CLI | MCP-only | Nothing is blocked. MCP tools and the skill are available. | `.gemini/settings.json`, `.agents/skills/groundwork/` |
| GitHub Copilot (VS Code) | MCP-only | Nothing is blocked. MCP tools and the skill are available. | `.vscode/mcp.json`, `.agents/skills/groundwork/` |
| Zed | MCP-only | Nothing is blocked. MCP tools and the skill are available. | `.zed/settings.json`, `.agents/skills/groundwork/` |
| Kiro | MCP-only | Nothing is blocked. MCP tools and the skill are available. | `.kiro/settings/mcp.json`, `.agents/skills/groundwork/` |
| OpenCode | MCP-only | Nothing is blocked. MCP tools and the skill are available. | `opencode.json`, `.agents/skills/groundwork/` |

In an MCP-only client, use `gw check` as the gate: run it before a commit or in CI. It exits 1 on a BLOCK finding.

The MCP-only configurations were written from each client's documented config format and checked by tests for shape, ownership and clean removal. They have not been exercised inside the running clients; if one does not load the server, `gw doctor` shows what is installed and the client's own MCP view shows why it was rejected.

## After installing

- **Claude Code** asks once to approve the project MCP server in `.mcp.json`. `/mcp` lists it.
- **Codex** loads project hooks and MCP config only in a trusted project. Open `/hooks` and approve the Groundwork entries.
- **Cursor**: enable the `groundwork` MCP server in settings if asked.
- **Gemini CLI**: `/mcp` shows whether the server connected.
- **GitHub Copilot**: open `.vscode/mcp.json`, press Start above the server, and use Copilot Chat in agent mode.
- **Zed**: the server appears in the Agent Panel settings. `gw install` edits `.zed/settings.json` only when it is plain JSON; if yours has comments, add the `context_servers.groundwork` entry by hand (`{"command": "gw", "args": ["mcp"], "env": {}}`).
- **Kiro**: approve the tools in the MCP Servers view.
- **OpenCode**: `opencode mcp list` shows the server.

## Launching without a global install

Clients start Groundwork as `gw`. If it is not on `PATH`, install with a different launcher:

```sh
gw install --command "npx -y groundwork-agent"
```

`gw doctor` warns about a client whose launcher is not on `PATH`.

## What `gw install` will not touch

- An entry named `groundwork` that you wrote yourself stays as it is.
- Other servers, hooks and settings in the same files are kept.
- On removal, a file Groundwork created is deleted only if nothing else was added to it.

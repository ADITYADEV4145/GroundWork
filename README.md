# Groundwork

**A live, local map of your codebase for coding agents.** Claude Code, Codex and Cursor use it to find code without grep loops, reuse what already exists, and stop calling functions that aren't there.

Coding agents waste most of their context finding their way around. They also rewrite helpers you already have under new names, and invent imports and calls that look plausible. Groundwork indexes your repository and hooks into the agent, so these problems are caught as they happen rather than in code review.

```text
$ gw check
BLOCK grounding (unknown-export): label.ts:1
Why: 'formatCurrency' is not exported in money.ts. Did you mean formatPrice (money.ts:1, formatPrice(cents: number): string)?
Fix: Use formatPrice (money.ts:1): formatPrice(cents: number): string.

BLOCK grounding (arity): label.ts:3
Why: formatPrice() takes 1 argument, got 2 — formatPrice(cents: number): string (money.ts:1).
```

Everything runs on your machine. There is no telemetry and no network access at runtime.

## What it does

| Problem | What Groundwork does |
| --- | --- |
| **Token waste**: grep loops, whole-file reads, re-reading unchanged files, huge command output | MCP tools return just the symbol you need within a token budget. A read guard catches repeat reads of unchanged files. Repeated commands get the earlier result, and noisy output is trimmed but keeps every failure. |
| **Duplication**: semantic clones, new code instead of changing old code, dead code left behind | `find_similar` shows existing code before the agent writes new code, and the agent states `REUSE`, `EXTEND` or `NEW because …`. At Stop, `gw check` flags clones, duplicate constants and files, and code left dead by a change. |
| **Invented code**: imports, functions and members that don't exist, wrong arguments | After every edit, Groundwork checks the new calls against the index and suggests the real symbol. `gw verify` and `gw check` report the same in CI. |

Supported languages are TypeScript, JavaScript (including JSX and CommonJS) and Python. Other files fall back to the agent's normal tools.

## Install

Requires Node.js 22 or later. Choose an install method:

**Homebrew** (installs Node.js too):

```sh
brew install ADITYADEV4145/groundwork/groundwork
```

**npm, pnpm or Bun:**

```sh
npm install -g groundwork-agent
# or
pnpm add -g groundwork-agent
# or
bun add -g groundwork-agent
```

**Install script:**

```sh
curl -fsSL https://raw.githubusercontent.com/ADITYADEV4145/GroundWork/main/scripts/install.sh | sh
```

**One-off, without installing globally:**

```sh
npx groundwork-agent doctor
# or
bunx groundwork-agent doctor
```

**From source:**

```sh
git clone https://github.com/ADITYADEV4145/GroundWork.git
cd GroundWork && npm ci && npm run build && npm link   # puts `gw` on your PATH
```

Then, in the repository you want your agent to work in:

```sh
gw init     # builds the index in .groundwork/ (about 1 s for 15k lines)
gw setup    # wires up Claude Code, Codex and Cursor; lists every file it will change and asks first
```

Restart your agent after setup. Codex asks you to trust the new hooks once, under `/hooks`.

| Flag | Effect |
| --- | --- |
| `--agent claude,codex,cursor` | set up only these agents (default: every agent installed) |
| `--profile minimal\|standard\|strict` | choose how strict the guards are (see [Profiles](#profiles)) |
| `--dry-run` | show the plan and write nothing |
| `--yes` | apply without asking (required when there is no terminal) |
| `--command "<cmd>"` | how agents launch Groundwork (default `gw`) |
| `--remove` | remove exactly what setup added, and nothing else |

Setup only writes project-level files: `.claude/settings.json`, `.mcp.json`, `.codex/hooks.json`, `.codex/config.toml`, `.cursor/hooks.json` and `.cursor/mcp.json`. It keeps your existing settings, and `gw setup --remove` returns each file to exactly how it was before setup.

Two more options launch the `gw` on your PATH from any of the installs above (one-off runs do not put it on PATH):
- **Claude Code plugin:** `/plugin marketplace add ADITYADEV4145/GroundWork`, then `/plugin install groundwork`.
- **Any MCP client:** run `gw mcp` as a stdio server from the repository root.

## How it works

```text
  agent                   hooks (fail open, 2 s budget)          .groundwork/index.db
┌─────────────┐ PreToolUse  ┌──────────────────────────┐  query  ┌──────────────────────────┐
│ Claude Code │ ──────────▶ │ read guard, repeat guard │ ──────▶ │ files, symbols, imports, │
│ Codex       │ PostToolUse │ refresh, grounding notes │         │ calls, literals,         │
│ Cursor      │ ──────────▶ │ output trimmer           │ ◀────── │ fingerprints             │
│             │ Stop        │ gw check duplicate gate  │ refresh └──────────────────────────┘
│             │ ──────────▶ └──────────────────────────┘                    ▲
│             │ MCP: repo_map, find_code, outline, read_symbol, callers,    │
│             │      callees, where_used, find_similar, verify_calls ───────┘
└─────────────┘
```

The index is built with tree-sitter and stored in SQLite (`node:sqlite`, falling back to `sql.js`). After each edit, only the changed files are parsed again; refreshing one to five files takes under 300 ms. [SKILL.md](SKILL.md) teaches the agent the workflow: navigate with the index, check for existing code before writing, and act on what the hooks report.

### MCP tools

| Tool | Returns |
| --- | --- |
| `repo_map` | a ranked directory tree with each file's top symbols; narrow it by path |
| `find_code` | symbols that match a name or description, with signatures |
| `outline` | a file's symbols and signatures without their bodies |
| `read_symbol` | one symbol's source, without the rest of the file |
| `callers` / `callees` / `where_used` | who calls a symbol, what it calls, and every reference to it |
| `find_similar` | existing code that already does what the agent is about to write |
| `verify_calls` | whether the imports and calls in a snippet exist, and how many arguments each call takes |
| `index_status` | index freshness and size |

Each answer has a token budget. When an answer is longer than its budget, it is cut short and gives a way to fetch the rest.

## Profiles

| Profile | What runs |
| --- | --- |
| `minimal` | the navigation tools and the read guard only |
| `standard` (default) | adds Reuse First, grounding notes after edits and waste guards. Findings at Stop are shown as warnings. |
| `strict` | as `standard`, but the Stop gate blocks once on each new BLOCK finding |

Choose a profile with `gw setup --profile strict`, or set `"profile"` in `.groundwork/config.json`. Every guard can also be turned on or off on its own, and a setting you write overrides the profile:

```json
{
  "profile": "standard",
  "grounding": { "enabled": true },
  "guards": { "repeatCommand": { "enabled": false }, "explorationHint": { "threshold": 20 } }
}
```

You can commit `config.json` so your team shares one profile. Everything else in `.groundwork/` is git-ignored.

## Commands

| Command | What it does |
| --- | --- |
| `gw symbols <query>` / `gw show <symbol>` | search symbols; show one symbol's signature, callers and callees |
| `gw similar "<description>"` | find existing code to reuse before writing a symbol |
| `gw check [--base <ref>]` | duplicate and grounding gate over changed code; exits 1 on BLOCK findings, so it works as a CI step |
| `gw verify [files...]` | grounding check alone; exits 1 on definite errors |
| `gw run -- <cmd>` | run a noisy command, keep the full log locally and print a trimmed summary |
| `gw report` | what the guards saved in a session |
| `gw refresh`, `gw stats`, `gw doctor`, `gw selftest` | update the index, show its contents, check the environment, run the acceptance checks |

Every command accepts `--json`.

## Accuracy

On the labeled duplicate corpus, BLOCK findings are 95% precise. They catch 100% of exact copies and 96% of renamed copies, but fewer heavily rewritten clones, which are reported as warnings or not at all. See [references/reuse.md](references/reuse.md).

Grounding reports only calls it can resolve definitely: it skips dynamic dispatch, computed member names and external packages. On this repository, 99% of internal imports resolve.

Corpus figures come from planted examples, not production repositories.

## Privacy and security

- All state lives in `.groundwork/` in your repository.
- The only download is `gw init --embeddings`, which fetches a local embedding model when you ask for one. Without it, `find_similar` runs fine without a model.
- Hooks run with your user permissions and never run commands for the agent.
- Hooks fail open: on any error or timeout, the agent continues as if Groundwork were not there.

See [SECURITY.md](SECURITY.md) for what each hook does and how to audit it.

## FAQ

**Does it slow my agent down?** Hooks usually answer in milliseconds and have a 2-second limit. If one times out, the action goes ahead.

**What if a guard is wrong?** Retry the read once, rerun the command with `GW_FORCE=1`, or mark an intended duplicate with `// groundwork: allow-duplicate <reason>`. Each override is logged, so you can tune the config. See [troubleshooting](references/troubleshooting.md).

**Will it block my agent?** Only in the `strict` profile, and only once for each set of findings.

**Does Cursor get everything?** It gets navigation, the read guard and grounding notes. Cursor's Stop hook cannot show a warning without blocking, so in `standard` Cursor shows no Stop findings. Use `strict` there, or run `gw check` yourself.

**How do I remove it?** Run `gw setup --remove`, then delete `.groundwork/`.

## Learn more

- [SKILL.md](SKILL.md): the protocol the agent follows
- [references/navigation.md](references/navigation.md), [reuse.md](references/reuse.md), [grounding.md](references/grounding.md), [docs/waste-guards.md](docs/waste-guards.md): how each part works
- [references/troubleshooting.md](references/troubleshooting.md): common problems and fixes
- [AGENTS.md](AGENTS.md): developing Groundwork (`npm test`, `npm run selftest -- --through 5`)

## License

MIT

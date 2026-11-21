# Groundwork

Your agent spends most of its tokens finding its way around, then rewrites code you already have. Groundwork fixes both.

Groundwork is an open-source tool and agent skill for Claude Code, Codex and Cursor. It keeps a live, local map of your codebase and uses it to:

- **navigate cheaply**: find a symbol, read only its definition, and skip re-reading unchanged files
- **reuse first**: find existing code before writing new code, and catch semantic clones and dead code before the agent stops
- **stay grounded**: flag invented imports, calls and members, and wrong arguments, right after each edit
- **cut waste**: answer repeated commands from the earlier result and trim huge outputs without dropping failures

It is 100% local: no network calls and no telemetry.

## Install

Requires Node.js 22+.

```sh
npm install -g groundwork-agent
cd your-repo && gw init      # builds the index in .groundwork/
gw setup                     # wires Claude Code, Codex and Cursor; shows every file it will change and asks first
```

Other ways to install:

- **Claude Code plugin:** `/plugin marketplace add ADITYADEV4145/GroundWork`, then `/plugin install groundwork`.
- **Skill only (any agent that reads skills):** `npx skills add ADITYADEV4145/GroundWork`.
- **Any MCP client:** run `gw mcp` as a stdio server from the repository root, or with `npx -y groundwork-agent mcp`.

`gw setup --remove` removes exactly what setup added. `gw setup --dry-run` shows the plan without writing anything.

### Optional local meaning signal

The default needs no embedding model or optional runtime. To consent to a model download:

```sh
gw init --embeddings                         # downloads the calibrated small model
gw init --embeddings --model owner/model     # explicitly choose another Transformers.js ONNX model
```

Model files stay in `.groundwork/models/`; consent is recorded in `.groundwork/config.json` only after installation succeeds. Subsequent `gw check`, `gw similar` and `find_similar` use local files only: there are no runtime downloads. Vectors are cached in the index by exact symbol-content hash and model id, so unchanged symbols are not re-embedded. Missing models or an unavailable optional `@huggingface/transformers` runtime warn once per process/model and fall back to the default classifier. Set `reuse.embeddings.enabled` to `false` to disable meaning.

Only the selected, calibrated model uses the meaning classifier; other model ids retain baseline scoring. [Candidate evaluation](bench/dupes/embeddings.md) documents precision, recall, size and speed. Meaning did **not** improve recall on the current labeled corpus; it remains opt-in. Description-only similarity scores are extrapolations, not separately calibrated natural-language probabilities.

For a CPU-only source installation if ONNX Runtime's optional CUDA installer fails, use `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install`. `npm install --omit=optional` omits the embedding runtime entirely; all default functionality still works.

## How it works

```
 edit / read / run           hooks (fail open, 2 s budget)          .groundwork/index.db
 ┌───────────────┐  PreToolUse   ┌──────────────────────────┐  query  ┌──────────────────────────┐
 │ Claude Code   │ ────────────▶ │ read guard, repeat guard │ ──────▶ │ files, symbols, imports, │
 │ Codex         │  PostToolUse  │ refresh, grounding notes │         │ calls, literals,         │
 │ Cursor        │ ────────────▶ │ output trimmer           │ ◀────── │ fingerprints (MinHash)   │
 │               │  Stop         │ gw check duplicate gate  │ refresh └──────────────────────────┘
 │               │ ────────────▶ └──────────────────────────┘                     ▲
 │               │  MCP tools: repo_map, find_code, outline, read_symbol,          │
 │               │  callers, callees, where_used, find_similar, verify_calls ──────┘
 └───────────────┘
```

The index covers TypeScript, JavaScript (JSX and CommonJS) and Python. It is parsed with tree-sitter and refreshed incrementally: only files whose content changed are re-parsed. Storage is `node:sqlite`, with a `sql.js` fallback. [SKILL.md](SKILL.md) teaches the agent the protocol: navigate with the index, run `find_similar` before writing and answer `REUSE` / `EXTEND` / `NEW`, then act on gate and grounding feedback.

## Profiles

| Profile | What runs |
| --- | --- |
| `minimal` | navigation tools and the read guard only |
| `standard` (default) | adds Reuse First, grounding notes after edits, waste guards, and Stop gate findings as warnings |
| `strict` | as `standard`, plus a Stop gate that blocks once on BLOCK findings |

Choose one with `gw setup --profile strict`, or set `"profile"` in `.groundwork/config.json`. Every guard can also be switched on or off on its own in that file, and an explicit setting overrides the profile.

## Commands

| Command | What it does |
| --- | --- |
| `gw symbols <query>`, `gw show <symbol>` | search symbols; show one symbol's signature, docs, callers and callees |
| `gw similar "<description>"` | find existing code to reuse before writing a symbol |
| `gw check [--base <ref>]` | duplicate gate over changed code; exits 1 on BLOCK findings (works in CI too) |
| `gw verify [files...]` | grounding check; exits 1 on definite errors |
| `gw run -- <cmd>` | run a noisy command, keep the full log locally, and print a trimmed summary |
| `gw report` | what the guards saved in a session |
| `gw stats`, `gw doctor`, `gw selftest` | index contents, environment checks, phase acceptance checks |

Every command takes `--json`.

## Privacy and security

Everything stays in `.groundwork/` in your repository. Hooks run with your user permissions, never run your commands for you, and fail open: if Groundwork errors or times out, the agent carries on. See [SECURITY.md](SECURITY.md) for what each hook does and how to audit it.

## FAQ

**Does it slow my agent down?** Hooks have a 2-second budget and usually answer in milliseconds. On timeout they allow the action.

**What if a guard is wrong?** Repeat the read once, rerun the command with `GW_FORCE=1`, or mark an intended duplicate with `// groundwork: allow-duplicate <reason>`. Forces are counted so you can tune the config. See [troubleshooting](references/troubleshooting.md).

**Which languages?** TypeScript, JavaScript and Python today. For other files, the agent falls back to its normal tools.

**Does it send my code anywhere?** No. There are no runtime network calls and no telemetry. Optional model installation downloads model files only after explicit consent; inference stays local.

**How do I remove it?** Run `gw setup --remove` and delete `.groundwork/`.

## Development

See [AGENTS.md](AGENTS.md). Benchmarks (`gw bench`) are not part of this release yet.

## License

MIT

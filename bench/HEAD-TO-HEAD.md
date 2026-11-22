# Head-to-head registration: h2h-v1

2026-11-22. Registered before any data collection. This PR collects no data.
GroundWork product pin: `10fc7493ed024d817b5cabf7cbf4aaa97533825c` (main).
Use the committed collector revision consistently for all arms; record it in exports.

## Arms and installation

| Arm | Available tools and instructions |
| --- | --- |
| baseline | Native shell + read, unchanged baseline prompt |
| groundwork | Unchanged v8 prompt text, MCP and read hooks |
| serena | Native tools + Serena MCP; no GroundWork hooks or skill |
| codebase-memory | Native tools + Codebase Memory MCP; no GroundWork hooks or skill |

Latest GitHub releases checked using the releases/latest API and git ls-remote:
Serena `v2.1.0`, commit `5e4f5cd173c7ff3eed37ee3f1de6c266b937c5dc`;
Codebase Memory MCP `v0.12.1`, commit `a7158ac2f48ca646b4527341b76f930f2aeff87e`.
Install before init (do not run vendor client installers that inject hooks/skills):

```sh
uv tool install -p 3.13 'serena-agent @ git+https://github.com/oraios/serena@5e4f5cd173c7ff3eed37ee3f1de6c266b937c5dc'
serena init
npm install -g codebase-memory-mcp@0.12.1
```

Exact stdio launches, with cwd set to the task workspace:
`serena start-mcp-server --project /absolute/task/workspace` and
`codebase-memory-mcp` (no arguments). `head-to-head/arms.json` freezes these;
`GW_BENCH_ARMS_CONFIG` is a JSON-path override for fake-server tests only, not collection.
Each capture MCP dispatch connects, calls and closes, just as GroundWork does.
Discover vendor tool schemas using MCP tools/list before collection; do not add
vendor-written system instructions, onboarding memories or client hooks to prompts.

The following fixed paragraphs are the only competitor prompt differences from
baseline (apart from the arm label needed to invoke the harness). They paraphrase
the cited vendor README guidance and quote its operative description, not its claims.

**Serena guidance:** You have Serena MCP tools as well as native shell and read.
Use its symbolic retrieval to explore code structure and relationships; use symbol
lookup, file outlines and referencing-symbol queries when relevant, and native reads
when needed. The vendor describes retrieval as exploring codebases “at the symbol
level, understanding structure and relationships”.
[Pinned README](https://github.com/oraios/serena/blob/5e4f5cd173c7ff3eed37ee3f1de6c266b937c5dc/README.md).

**Codebase Memory guidance:** You have Codebase Memory MCP tools as well as native
shell and read. Index the current workspace with index_repository before querying
it; use search_graph and graph traversal to locate code and follow relationships,
and native reads when needed. The vendor describes its usage as “Search your code,
follow call graphs, and explore software architecture”.
[Pinned README](https://github.com/DeusData/codebase-memory-mcp/blob/a7158ac2f48ca646b4527341b76f930f2aeff87e/README.md).

## Collection and analysis

All tasks, graders, manifest order, LH dependencies, collection and acceptance rules
are inherited unchanged from [PROTOCOL.md](PROTOCOL.md), using stable-v1 capture
timing. Exactly 16 independent sessions per arm per suite, runs 1–16: 128 sessions.
No arm swapping, optional stopping, early stopping, unfavorable-result replacement
or pooling with older data. Publish null, negative and blocked/incomplete results.

Indexing is **inside** the session envelope for all indexed arms, not pre-init.
capture.mjs only unpacks the first workspace before init records sessionStartedAt;
it does not build a GroundWork index. GroundWork refreshIndex runs on MCP tool calls
(src/mcp/server.ts); read-hook indexing also happens after init. Do not prewarm any
task index. Serena activation/indexing and CBM index_repository run after init,
including later task setup and server startup. Use clean per-session vendor state
and caches; never reuse a task index from another session or arm.

Per suite the five directed comparisons are GroundWork vs baseline, Serena vs
baseline, Codebase Memory vs baseline, GroundWork vs Serena, and GroundWork vs
Codebase Memory. For each, report the same three primary estimands, arithmetic
means and reduction ratios as PROTOCOL.md: session elapsed/fixed task count,
emitted UTF-8 bytes/session, tool-side ms/session. The named reference replaces
baseline in the ratio. Use the same independent whole-session 10,000-draw bootstrap,
xorshift32 seed 0x51ab17ed reset per metric, nominal indices 249/9749. Zero reference
means give unavailable reductions. Failed tasks retain all costs.

Latency alone is confirmatory per suite. Bonferroni covers five comparisons × two
suites = ten tests: two-sided 99.5% intervals, nearest-rank zero-based indices
24/9974 (adjusted lower bound index 24). A win requires positive adjusted lower
bound and no category with fewer successes in the tested arm than the reference.
Report category success counts/failures; equal scores are not a correctness win.
Bytes and tool-side time are not alternative grounds for declaring a latency win.
Provider-billed tokens are reported only if exposed by the agent; bytes/4 is never
called tokens. No cross-vendor performance claims are registered here.

Run `node --import tsx scripts/bench-h2h.mjs EXPORT_DIRECTORY` after collection;
exports must contain all four arms for both suites with a single captureRevision.
Output goes to stdout; this command does not write historical results or evidence.

## Who can run what today

The Devin-driven collection used for v7–v9 can run all four arms now without a
provider key. Serena is a local MCP extension to an existing client/LLM, not a
hosted model (README, MCP integration and language-server sections); CBM explicitly
states “Indexing and graph queries need no hosted service or API key” in its pinned
README. Use local language-server backends and no optional hosted integrations.
Claude Code and Codex agent variants each require a provider key; none is connected,
so those variants are registered but not runnable. Analyze agent variants separately;
never mix their sessions to fill an arm.

## Not comparable

Vendor-published claims from Serena, Codebase Memory MCP, Zilliz Claude Context and
Augment use their own tasks and are not compared with GroundWork's results.

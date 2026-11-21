# Agent benchmarks

The benchmark is a **source checkout** tool. It does not call an agent provider or ask for credentials. Collect observations with the same agent and settings in both arms, then score them locally:

```sh
npm ci
npm run build
node dist/cli/main.js bench --suite nav --runs 3 --observations /path/to/trusted/captures
```

Use only **trusted captures**. Scoring an edit applies an agent's patch to a disposable checkout and runs the suite's local assertions against that code. This is not a sandbox.

Dated Markdown, JSON and graded evidence go to `bench/results/`. To reproduce a checked-in report without rerunning agents or applying their patches, omit `--observations`:

```sh
node dist/cli/main.js bench --suite nav --runs 3
```

The latter reads `bench/nav/evidence.json`, validates the task/verifier digest and complete pairing, and recalculates the report. It does not make new token savings measurements. Add `--json` for machine output and `--output-dir <dir>` to choose a destination.

## Capture protocol

For each condition (`baseline` and `groundwork`) and repeat, start a separate agent session in the same mode. Use a fresh state directory that does not yet exist. Each task starts from the same pinned source, and its result is checked against a fixed answer or behavioral test. Choose order before observing results; use the same order for both arms of a repeat.

```sh
state=/absolute/path/to/run-state
node bench/capture.mjs init "$state" groundwork 1
node bench/capture.mjs list
node bench/capture.mjs begin "$state" gw-01
node bench/capture.mjs mcp "$state" gw-01 find_code '{"query":"incremental index refresh"}'
node bench/capture.mjs read "$state" gw-01 src/index/refresh.ts 40 8
node bench/capture.mjs finish "$state" gw-01 '["src/index/refresh.ts:refreshIndex"]'
# Repeat begin/tools/finish for every task, then export.
node bench/capture.mjs export "$state" > groundwork-1.json
```

During a task, give the agent access to the task workspace only via the capture tools. In both arms, use `shell <state> <task> '<command>'` for shell search and edits, and `read <state> <task> <path> [start [count]]` for full/range reads. In Groundwork, add the navigation section of the skill to the agent's instructions, enable the MCP action and use the Read wrapper to dispatch the actual Claude read hooks. The baseline has no MCP action, Groundwork skill guidance or read hooks. Omit the answer argument for edit tasks; `finish` takes the working-tree patch relative to that step's baseline.

For the recorded navigation benchmark, both arms followed the same rotation: Groundwork → TypeScript → Python in repeat 1, TypeScript → Python → Groundwork in repeat 2, and Python → Groundwork → TypeScript in repeat 3. Tasks within each group followed manifest order; all six edits came last. Each task used a fresh checkout, so the navigation instructions could prompt a new repository map even when an agent had seen that repository earlier in the session.

The collector measures actual response bytes delivered through these actions. It converts those bytes to **estimated tool-output tokens** by dividing by four. It doesn't count messages, private model context, setup and skill instructions, or shell harness wrappers. Provider input/output counters are separate optional `usage: {inputTokens, outputTokens}` fields per task; never substitute the estimate for that counter. Devin did not expose provider counters or temperature/seed settings; we used the same Devin mode and isolated worktrees, but one conversation per arm/repeat means knowledge and compaction can carry over between its tasks.

In the first run, both arms solved every task on every repeat, but Groundwork used **14.3% more estimated tool-output tokens** at the median (95% interval: 5.5% fewer to 35.2% more). Direct source-read bytes fell 57%, but search results, symbol bodies, outlines and repository maps made up 80% of the Groundwork arm's output. No repeated reads were blocked. Some agents retried invalid tool arguments or skipped the outline before reading a small file; those outputs still count.

The follow-up repeats the same pinned tasks, order, baseline instructions, graders and estimator with the updated navigation tools and their published skill. The tools can return just locations for directed lookups, and repository maps use smaller pages. The updated skill calls for a map only when orientation is needed and for reading bodies only when locations or call edges are insufficient.

## Add a suite

1. Add `bench/<suite>/tasks.json` with a pinned Groundwork Git `revision`, optional `mcpTools`, and `tasks` with unique `id`, `repo` (`groundwork` or a directory under that revision's `fixtures/`), `category`, `prompt`, and optional `edit`. Set `edit: true` for a task that submits a patch (default for `fix` and `feature`).
2. To carry a repo across tasks, set matching `sequence` on related tasks and give each a contiguous `step` starting at 1. The collector reapplies earlier patches in the sequence as commits, then measures the next step. All steps in a sequence use the same repo.
3. Add `bench/<suite>/grade.mjs` exporting `grade(task, observation, context)`. Return a boolean or `{success, metrics: {duplicatesAdded: 0, inventedCalls: 0}}` with suite-specific numeric metrics. `context.withWorkspace(async (root) => ...)` gives the verifier the pinned worktree with prior sequence patches and the current patch applied.
4. Capture with `GW_BENCH_SUITE=<suite>` set for every capture action. Grade with `gw bench --suite <suite>`. Use `--suite all` to report every suite with a task manifest.

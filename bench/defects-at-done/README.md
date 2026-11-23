# DefectsAtDone

Measures the defects left in a change at the moment a coding agent says it is done, across arms that differ only in the tool the agent is given.
No agent sessions have been run on this suite yet, so there are no results and no claims.

## Layout

| Path | Contents |
| --- | --- |
| `tasks.json` | repositories (fixture or `url` + pinned `sha`) and tasks, with trap metadata the agent never sees |
| `repos/` | fixture repositories copied into a fresh git workspace per session |
| `hidden/` | hidden acceptance checks, run from outside the workspace |
| `reference/` | reference solutions, used only by `validate` |
| `arms.json` | arms and their pinned versions; an arm with no version and launch command is refused |
| `agents.json` | agent command adapters |
| `../prereg/defects-at-done-v1.md` | preregistration |

The grader is `src/bench/defects/grade.ts` (`GRADER_VERSION`). It counts, on added lines only: invented calls and imports, wrong arguments, type errors,
re-implemented helpers, callers and docs left stale, and failing affected tests. Task success is the hidden plus visible checks.

## Commands

```
gw bench validate --suite defects-at-done [--cache <mirrors>]  # untouched fails, reference passes, for every task
gw bench run --suite defects-at-done --arms all --run <id> --out <dir outside the checkout> --model <model> [--prereg <file>]
gw bench leaderboard --suite defects-at-done <dir>/<id>
gw bench pr-study --suite defects-at-done --list prs.json --cache <mirrors>
```

`run` is resumable, writes one record per arm, task and replicate, and keeps invalid sessions. Without `--prereg` the report says it supports no claim.
`leaderboard` writes `report.json`, `report.md` and a static `index.html`.
`pr-study` scans the changed lines of listed pull requests in local mirrors and prints counts by finding kind and language only: no repository, author, PR number or code.

## Known gaps

- 50 of the 60 tasks the preregistration requires, on TypeScript, Python and Go. Each of the six categories has the required eight or more (hidden-helper 9, real-failure 9, the others 8). Ten tasks are still missing, so no confirmatory run is possible yet. The 20 fixture tasks added after the pilot have had no agent run.
- The real-failure tasks are past bugs in more-itertools (MIT) and gorilla/mux (BSD-3-Clause), each pinned to the commit before its upstream fix; `reference/<task>.patch` is that upstream fix and `provenance` links it. They need local mirrors: `validate --cache <mirrors>` checks them and plain `validate` lists them as skipped. No agent has been run on them.
- An exploratory pilot on five of these tasks tied at zero defects in both arms (`bench/pilots/2026-11-23-devin/`), so the current fixture tasks are not expected to separate arms on a strong agent.
- Competitor arms are unpinned, so they are reported as not run.
- Sessions run in fresh local workspaces, not containers.
- The grader has unit tests but no human-label audit yet; the preregistration requires one.
- Only a Claude Code adapter is defined, and it has not been exercised against a live model here.

# Benchmark v3 agent evidence

These results score the 30 completed agent workspaces from `~/work/done-baseline` and `~/work/done-groundwork`, labelled **Devin (child sessions, default settings)**. Both arms passed protocol validation without modifications to submissions or changes to the harness, tasks, or scoring rules.

Both arms succeeded on 15/15 tasks (Wilson 95% interval: 79.6%–100%). Neither arm had measured final wrong calls, attributed hidden-test failures, or committed call-error repairs; all three metric totals and their paired differences are zero. The observed no-success-drop gate passes, but these runs do not demonstrate a grounding benefit. The fix-token metric remains a committed-history chars/4 proxy, not actual model usage.

`baseline.json` and `groundwork.json` contain task-set hashes, final commit IDs, step counts and per-task evidence. `report.json` and `report.md` contain seeded bootstrap and Wilson intervals. See `../README.md` for reproduction commands, metric definitions and limitations. These are agent-run results, not reference-solution or synthetic unit-test output.

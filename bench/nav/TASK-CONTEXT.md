# Offline task-context replay

Run `node --import tsx bench/nav/task-context.mjs` from the repository root. The replay uses all 14 navigation (not edit) prompts for the TypeScript and Python fixtures in `tasks.json` and the corresponding answer references from `grade.mjs`. It does not change the historical suite or run a model.

Both arms receive the original task text without symbol or file hints. The existing-tool arm uses `find_code` with `include_body: true` for locate tasks and `explore` for traces. Both arms make one batched `read_symbol` call with the missing answer IDs if the initial reply omits a required symbol or callable definition. The scripted fallback uses the answer key, not model discovery; the replay measures reply coverage and calls, not agent latency, turns, or task success. It does not grade the extra callers/reuse evidence.

| Arm | Total calls | Calls/task | One-call tasks | Estimated output tokens |
| --- | ---: | ---: | ---: | ---: |
| Existing tools | 25 | 1.79 | 3/14 | 3,799 |
| Task context | 18 | 1.29 | 10/14 | 5,105 |

Output tokens are UTF-8 bytes/4, rounded up per reply; protocol envelopes are excluded. The scripted task-context arm used 28% fewer calls and returned about 34% more output tokens.

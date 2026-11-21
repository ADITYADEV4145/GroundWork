# Benchmark v3: near-miss grounding

This is a **harness and task set, not agent evidence**. No baseline or treatment outcomes have been invented. Until both arms are run, scored and reported, the full Phase 4 gate fails. `--quick` explicitly skips this evidence check.

## Contents and isolation

`repos/` contains three dependency-free, small domain repositories (two TypeScript, one Python; 12–13 files each). `tasks.json` has five natural-language tasks per repo, entry points, and private ground-truth API symbols. `hidden/` has four parameterized acceptance scenarios per task; TS tasks also have a strict compile check. `reference/` contains complete reference implementations as inert text templates. They are **not** copied to agent workspaces. Templates are applied only during reference validation.

The SHA256 task-set hash covers prompts, truth, every fixture file, hidden tests and reference templates (paths and contents). Stored results must match it exactly. Changing any of those invalidates old results. Prompts intentionally avoid the helper APIs' real names; entry-point names identify the function to implement, not the helpers to discover.

Preparation copies an allowlisted fixture tree, not this checkout. Only a task's prompt/protocol and visible tests enter its git history. The treatment installs a private copy of the built CLI and locked runtime dependencies under ignored `.tools/` and builds an index. It does not link back to this checkout or include benchmark data. No API key is needed. Baseline workspaces have no tool, tool config, feedback script or mention of the treatment in their protocol.

Run agents in **separate clean Devin sessions**, exposing only the assigned workspace, not this harness checkout, sibling tasks, hidden tests or reference solutions. Ensure baseline sessions do not inherit any preinstalled grounding tooling or plugin. Preparation is not an OS sandbox and cannot hide the evaluator's filesystem from an agent with unrestricted access. Evaluating agent-authored code executes that code locally; use disposable, credential-free environments. No network or external services are required at evaluation time.

## Operator workflow

Requirements: Node >=22.18, Python >=3.10, git, tar, installed GroundWork dependencies and a current build. The treatment's `npm ci --offline --omit=dev --omit=optional --ignore-scripts` uses the existing npm cache and lockfile; populate the cache before going offline. A cache miss is a hard preparation error, never a baseline-like treatment workspace.

```sh
npm run build
npm run bench:grounding -- validate

# Use persistent directories OUTSIDE this checkout. Repeat for all three repo IDs.
npm run bench:grounding -- prepare --arm baseline --repo customer-desk --out ~/work/v3-baseline
npm run bench:grounding -- prepare --arm baseline --repo parcel-ops --out ~/work/v3-baseline
npm run bench:grounding -- prepare --arm baseline --repo dispatch-desk --out ~/work/v3-baseline
npm run bench:grounding -- prepare --arm groundwork --repo customer-desk --out ~/work/v3-groundwork
npm run bench:grounding -- prepare --arm groundwork --repo parcel-ops --out ~/work/v3-groundwork
npm run bench:grounding -- prepare --arm groundwork --repo dispatch-desk --out ~/work/v3-groundwork

# Give one task workspace and its TASKS.md to each independent agent session.
# Retain run.json in each arm directory; it pins each initial commit.
# After all agents finish:
npm run bench:grounding -- score --arm baseline --out ~/work/v3-baseline --agent 'Devin/model-version/settings'
npm run bench:grounding -- score --arm groundwork --out ~/work/v3-groundwork --agent 'Devin/model-version/settings'
npm run bench:grounding -- report
npm run selftest -- --through 4
```

Use the same agent version/settings and time budget in both arms. Randomize/counterbalance arm order and use fresh sessions to avoid carryover. Run each of the 15 tasks once per arm; do not pick the best of repeated attempts. Record any reruns separately rather than silently replacing results. `score --results <dir>` and `report --results <dir>` support scratch experiments; the gate reads only `bench/grounding/results/`.

Each workspace is its own git repository. Agents commit **every edit step, including broken ones**, before the next edit (`git commit -am "step: ..."`; explicitly stage new source/test files first). Visible tests can run freely. Existing services, tests, config and public signatures are fixed; helpers/new tests may be added. Scoring rejects dirty/untracked work, changed protected fixture files, rewritten base ancestry, merge/non-step commits and symlinks/submodules. An unchanged workspace is scored as a failed task, not missing data. All 15 distinct workspaces are required for an arm result.

In the treatment, after each edit run `node .benchmark/check.mjs <edited-file> [...]`, read and act on the output, then commit that state **before making the repair**. The wrapper invokes the existing CLI `.tools/bin/gw --json verify <files>`, appends stdout/stderr and parent commit to `.benchmark/feedback.jsonl`, and preserves the CLI exit code. It checks whole edited files, the CLI equivalent of PostToolUse feedback. It is not a Claude-specific hook. The scorer requires each source edit commit to include feedback covering its edited files and parent revision, and rejects truncated/rewritten logs. Preserve `.tools/` when transferring a treatment workspace back to the runner.

## Deterministic scoring

The evaluator archives each committed state into a disposable scratch tree, leaving the submitted workspace untouched, refreshes the code index, and runs the hidden suite. It never copies hidden tests or truth into the submitted workspace or its history. No model or LLM judge is used.

Per task, JSON records:

* **success:** all four hidden scenarios and (for TS) the strict compile check pass. Missing/unimplemented workflows fail. Each hidden scenario tests normal, absent and invalid-domain inputs. Tests use distinct synthetic customers/orders to discourage constant answers.
* **wrongCallsFinal:** conservative, deduplicated call/import error sites remaining in the final commit. Evidence combines Groundwork unknown imports/exports/members and argument checks; TS diagnostics at call/import sites; Python unbound bare-call AST checks; and exercised NameError/AttributeError/TypeError/ImportError (plus JS equivalents). Call sites use file/line/zero-based column/name; import sites use file/line/name. Runtime reports without columns corroborate the first matching statically identified error site rather than adding a duplicate. Multiple same-name calls on one line remain separate. External/dynamic uncertainties are not guessed to be errors. Unchecked parse/status files are recorded.
* **wrong valid siblings:** absence of a preferred ground-truth API alone is **not** an invented call. Missing names are reported for audit, not penalized. For enumerated near-miss sibling APIs, the scorer tries a one-name substitution with the ground-truth API in the target file. A wrong-sibling label requires that this change alone restores all acceptance checks. This provides causal evidence rather than treating every failed assertion as an invented call. Aliased names, multiple interacting mistakes, computed/dynamic calls and semantically wrong but valid alternatives may be undercounted; inspect per-task evidence. Alternative correct implementations are not penalized for bypassing the reference's exact call sequence.
* **hiddenFailuresCaused:** number of failed hidden checks attributable to those call errors: a compiler/runtime diagnostic must name the error, or the sibling counterfactual must restore acceptance. There are four scenario checks per Python task and five checks (including compilation) per TS task. This counts failing checks, **not** distinct root causes or all failed assertions after execution stopped. Ordinary assertions or unimplemented stubs are not automatically attributed to invented calls.
* **fixTokensProxy:** **not actual model/billed tokens.** Track an incident by file, kind, symbol and occurrence ordinal (not line, so line movement alone is not a repair). When an introduced incident disappears in a later step, charge the complete source diff of that fixing commit, with headers, once per fixing commit; add recorded grounding stdout/stderr mentioning the incident, once per feedback record. Divide characters by four, without rounding. This deliberately coarse proxy includes unrelated edits bundled into a fix; it excludes chat, reasoning, test output and unrecorded tool feedback, and misses edits/fixes between commits. Removing/replacing an erroneous site counts as a repair attempt even if the task still fails. Baseline feedback is zero unless deliberately supplied in a synthetic test. Per-fix commit IDs, character counts and incident IDs make the estimate auditable.

`score` records the agent label, task-set hash, final commit, steps, failure output, error evidence and proxy breakdown in `<arm>.json`. Acceptance output paths are normalized. Step history is essential: no history means no claim about actual tokens or hidden intermediate mistakes. Groundwork's checker and conservative dynamic attribution are not a complete semantic oracle; this benchmark reports measured errors, not a proof that no other bugs exist.

## Reports and gate

`report` writes `report.json` and `report.md`. Each arm has totals/means and 95% percentile-bootstrap CIs (10,000 task-level resamples, seed 3107). Paired differences are Groundwork minus baseline, resampling paired task differences, with both mean and total intervals; negative is better for error/fix metrics. Success rates have Wilson 95% intervals; the paired success difference also has a bootstrap interval. With only 15 related tasks/three repos these intervals describe task variation, not agent-run variance or strong population generalization.

The gate requires both current 15-row arms, correct IDs/repositories/hash, current deterministically recomputed intervals and markdown, and **observed Groundwork successes >= baseline successes**. This is the requested observed no-drop rule, not a statistical noninferiority test. Missing results fail full runs; quick runs explicitly skip. Reference validation and synthetic unit-test reports are not installed as evidence.

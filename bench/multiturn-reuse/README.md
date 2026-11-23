# Multi-turn reuse suite

Frozen design and decision rule: [PROTOCOL-REUSE.md](../PROTOCOL-REUSE.md).
No real agent data has been collected. The public task file contains 20 requirements;
the collector reveals only the active turn. Agents may not inspect this directory,
the harness source, hidden manifests, acceptance tests or scripted solutions.
Only full pinned upstream source is materialized in their persistent workspace.

## Setup and collection

Use Node 22+ and Python 3.10+ (standard library only; no repository dependencies
are needed for the hidden contracts). Build first. The development-only setup
clones or reuses verified upstream Git objects in an external cache; it does not
install dependencies or execute upstream project code. Click is about 20k Python
LOC, pytest about 100k, compared with the small synthetic existing fixtures.
Full repository licenses are preserved in each archive. Repos/pins/licenses and
chain IDs are in repos.json, shared with the existing real-repo experiment pins.

```sh
npm ci
npm run build
node scripts/setup-multiturn-repos.mjs
export GW_BENCH_SUITE=multiturn-reuse GW_BENCH_PROTOCOL=stable-v1
export GW_BENCH_CHAIN=click-summary GW_BENCH_AGENT='Devin normal'
S="$HOME/reuse-normal-baseline-1" # must not exist yet
node bench/capture.mjs init "$S" baseline 1
node bench/capture.mjs list "$S" # exactly one requirement
node bench/capture.mjs begin "$S" click-summary-1
# Only captured shell/read (plus mcp for groundwork) while solving.
node bench/capture.mjs finish "$S" click-summary-1
# list again, begin/solve/finish the revealed requirement, through turn 5
node bench/capture.mjs export "$S" > "$HOME/reuse-normal-baseline-1.json"
```

Run numbers 1..16 cycle through the four chains in repos.json order; four runs per
chain, 16 per arm/mode, 64 total. Each context handles only one assigned chain.
Init is before disclosure and starts the stable-v1 workspace-ready session clock.
One physical workspace and its .groundwork state survive all turns. Turn finish
commits a harness-owned snapshot so later patches are incremental, never a reset.
Do not make manual commits or edit existing repository code. The final session
timestamp includes snapshot capture. Other suites retain their previous behavior.

External templates and the unlaunched workflow are in /home/ubuntu/bench-rerun/.
Use the implementation's final commit for both collector and product. Grade only
in a checkout of that same commit, after preserving raw exports and mode records:

```sh
node scripts/bench-multiturn-reuse.mjs "$HOME/reuse-exports" "$HOME/reuse-results"
```

The command requires all 64 planned unique exports, stable timestamps/actions,
correct mode labels/pin and five ordered turns. It applies incremental patches in
clean pinned workspaces, executes hidden acceptance per snapshot (15s/turn), then
computes static metrics separately. Every report preserves acceptance errors and
the canonical JSON capture hash. Non-Python files count toward patch-scope checks
but not Python LOC/clone denominators. Modifying existing repo paths fails success.
Malformed source fails acceptance; its raw normalized tokens enter exposure while
invalid ASTs are explicitly reported. A broken baseline parser or missing runtime
is an analysis error, never a zero metric. Grading executes submitted Python: run
it only in a disposable trusted benchmark environment, never on shared production.

## Tests and synthetic calibration

```sh
node --test scripts/bench-*.test.mjs
python3 bench/multiturn-reuse/test_metrics.py
node scripts/bench-multiturn-dryrun.mjs "$HOME/reuse-synthetic-new-directory"
```

The last command captures eight scripted baseline chains (ideal vs copy-paster
for every chain), validates stable-v1 exports and hidden acceptance, and requires
100% vs 0% opportunity reuse and at least 20 percentage points of clone separation.
These outputs are synthetic plumbing tests, not performance evidence or one of
the pre-registered agent sessions. The copy-paster uses renamed normalized clones
of existing and earlier logic; the ideal delegates through imported canonical
helpers and its own earlier entry points. A short helper may be below the fixed
50-token clone threshold; reuse and clone metrics deliberately remain distinct.

Static limitations: direct Python bindings/re-exports and transitive module-level
function calls are resolved conservatively. Dynamic aliases, reflection, methods,
higher-order dispatch and clever dead-code predicates may remain unresolved or
over-approximated. This is a static call-graph metric, not proof that a call ran.
Acceptance checks execution separately but does not dynamically prove reuse.
Clone matching is exact over normalized **function bodies**, including class and
nested functions, not a semantic equivalence detector or a module-global clone
detector. It tolerates renames/literal changes but can miss reordered algorithms
or generate matches for structurally similar unrelated logic. The fixed threshold
and full per-source token counts make these limits auditable; do not retune after
seeing agent results. Report opportunity and growth denominators beside rates.

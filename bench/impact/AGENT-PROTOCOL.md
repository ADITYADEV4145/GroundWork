# Pending change-impact agent gate — NOT RUN

The plan's actual gate requires agent runs, not just a tool benchmark. No agent
runs have been conducted for this feature. Tool-level recall cannot establish
that agents update more planted callers or preserve task success.

Before running agents, freeze task revisions, evaluation tests, model/version,
budgets, sample size and randomization seed in a separate registration. Use real
API evolution tasks with a planted unchanged caller that must change, including
required parameters, renames, deletion/replacement and return-shape changes.
Keep initial edits, repositories and task instructions identical between arms.

- Baseline: existing GroundWork tools without change_impact or impact Stop context.
- Treatment: baseline plus change_impact and its nonblocking Stop context.
- Randomize paired runs within task/model; isolate repositories and sessions.
- Score caller updates using held-out tests and blinded patch review. Score task
  success independently, including regressions and intended API behavior.
- Primary gate: treatment updates the planted caller in strictly more runs, and
  task success is not lower than baseline. Publish per-task/arm counts and paired
  uncertainty, all failures/timeouts and protocol deviations. Do not substitute
  lookups or edits alone for a successful caller update.

This is a pending protocol outline, not an executed or statistically finalized
agent study. Do not claim the plan's agent gate passed from deterministic results.

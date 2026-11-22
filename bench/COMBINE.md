# Combining paired runs

Navigation and long-horizon `results/combined.evidence.json` files feed the charts.
`results/combined.json` and `results/combined.md` retain the complete latest
combined grader output; existing active evidence, dated historical reports and
initial navigation evidence are not replaced. Run counts and chart sample sizes
are read from the combined evidence. The historical pinned graders do not emit
the newer long-horizon evaluator fingerprint; combined reports retain their
actual output rather than attaching a fingerprint for a different evaluator.

Collect every task in a fresh session for each arm/run, using Node v24.22.2,
agent `Devin normal`, model `null`, and these exact collector checkouts:

- Navigation: `e0c5f6bbc7a49f9399abf4227ef7253958d03a97`
- Long-horizon: `fa8657cbb6bc73dfb9a8011b891f55b6af499eda`

Build each checkout before use. Only grade trusted capture exports: graders
apply patches and execute local assertions, not a sandbox. Each capture directory
must contain exactly both arms for runs 1 through N, with no smoke exports.

```sh
node scripts/bench-combine.mjs --runs 8 \
  --nav-captures /home/ubuntu/bench-combined/nav-captures \
  --lh-captures /home/ubuntu/bench-combined/lh-captures \
  --nav-build /home/ubuntu/bench-compat-exact-nav \
  --lh-build /home/ubuntu/bench-compat-lh
```

The default run count is 8. Use `--runs 3` to replay the original captures.
Both graders must succeed before any combined repository evidence is replaced. The script
archives raw exports in each suite's `observations/`, writes combined evidence and
combined reports, and regenerates both copies of all charts. Review results and
update README/website prose before publishing; old prose must not be assumed true
for new data. This command neither commits nor deploys.

Wall-time bars show arithmetic means, while the separate whiskers show the median
of paired-task percentage reductions with the grader's seeded 95% task-bootstrap
interval. These are different estimands: do not interpret the whiskers as confidence
intervals around the mean bars. Repeats are summed within task; tasks, not sessions,
are resampled (2,000 draws, seed `0x963b41d7`). Positive means faster; negative means
slower. Shared sequential context and between-session/model variation are not
accounted for by these intervals.

Protocol deviations were noted per session: some sessions wrote files via the
shell wrapper rather than the read wrapper, and one long-horizon agent's first
`find_similar` call failed validation. Captures describe those executions, not a
perfectly uniform protocol; work outside wrappers or task timers is unmeasured.

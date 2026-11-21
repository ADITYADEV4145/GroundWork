# BLOCK evidence wave

16/16 baseline runs scored; 0 GW checks UNAVAILABLE.

Check-only suite: acceptance and task success are not evaluated. Task kinds are sampling annotations, not duplicate verdicts. Every BLOCK requires review, especially hard negatives. UNAVAILABLE is not zero-finding evidence.

| Task | Kind | Patch/execution | GW | BLOCK | WARN |
| --- | --- | --- | --- | ---: | ---: |
| block-click-audit-filename | clone-prone | scored | PASS | 0 | 0 |
| block-click-menu-summary | clone-prone | scored | PASS | 0 | 0 |
| block-click-option-conflicts | hard-negative | scored | WARN | 0 | 2 |
| block-click-profile-app-dir | clone-prone | scored | PASS | 0 | 0 |
| block-click-repl-split | clone-prone | scored | WARN | 0 | 2 |
| block-got-admission-budget | hard-negative | scored | WARN | 0 | 1 |
| block-got-cache-url-options | clone-prone | scored | WARN | 0 | 2 |
| block-got-download-size | clone-prone | scored | PASS | 0 | 0 |
| block-got-event-journal | hard-negative | scored | PASS | 0 | 0 |
| block-got-once-event-proxy | clone-prone | scored | BLOCK | 2 | 0 |
| block-got-trailer-links | clone-prone | scored | WARN | 0 | 2 |
| block-pytest-artifact-route | hard-negative | scored | PASS | 0 | 0 |
| block-pytest-optional-fixture-names | clone-prone | scored | BLOCK | 2 | 0 |
| block-pytest-report-relpath | clone-prone | scored | WARN | 0 | 2 |
| block-pytest-report-root | clone-prone | scored | PASS | 0 | 0 |
| block-pytest-stub-module-name | clone-prone | scored | WARN | 0 | 2 |

See block-results/ for patches' application/check errors and block-review.json for the shared, suite-attributed review queue.

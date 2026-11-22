# BLOCK evidence wave

27/27 baseline runs scored; 0 GW checks UNAVAILABLE.

Check-only suite: acceptance and task success are not evaluated. Task kinds are sampling annotations, not duplicate verdicts. Every BLOCK requires review, especially hard negatives. UNAVAILABLE is not zero-finding evidence.

| Task | Kind | Patch/execution | GW | BLOCK | WARN |
| --- | --- | --- | --- | ---: | ---: |
| block6-click-alias-schema | hard-negative | scored | PASS | 0 | 0 |
| block6-click-ansi-stream | clone-prone | scored | BLOCK | 10 | 0 |
| block6-click-color-default | clone-prone | scored | BLOCK | 3 | 0 |
| block6-click-color-fragment | clone-prone | scored | BLOCK | 2 | 0 |
| block6-click-console-probe | clone-prone | scored | BLOCK | 1 | 0 |
| block6-click-console-stream | clone-prone | scored | BLOCK | 20 | 1 |
| block6-click-pager | clone-prone | scored | BLOCK | 46 | 1 |
| block6-click-parameter-order | clone-prone | scored | BLOCK | 2 | 2 |
| block6-click-raw-terminal | clone-prone | scored | BLOCK | 2 | 0 |
| block6-click-shell-expansion | clone-prone | scored | BLOCK | 1 | 2 |
| block6-click-text-reader | clone-prone | scored | BLOCK | 16 | 0 |
| block6-click-text-writer | clone-prone | scored | BLOCK | 16 | 0 |
| block6-click-visible-commands | clone-prone | scored | BLOCK | 1 | 0 |
| block6-got-hook-inventory | hard-negative | scored | WARN | 0 | 2 |
| block6-pytest-chunk-copy | clone-prone | scored | BLOCK | 2 | 0 |
| block6-pytest-default-equality | clone-prone | scored | BLOCK | 2 | 0 |
| block6-pytest-explanation-lines | clone-prone | scored | BLOCK | 2 | 0 |
| block6-pytest-explanation-split | clone-prone | scored | BLOCK | 2 | 0 |
| block6-pytest-extended-path | clone-prone | scored | BLOCK | 2 | 0 |
| block6-pytest-pyc-file | clone-prone | scored | BLOCK | 2 | 2 |
| block6-pytest-pyc-stream | clone-prone | scored | BLOCK | 2 | 0 |
| block6-pytest-raw-code | clone-prone | scored | WARN | 0 | 2 |
| block6-pytest-repr-exception | clone-prone | scored | BLOCK | 3 | 0 |
| block6-pytest-source-status | hard-negative | scored | WARN | 0 | 2 |
| block6-pytest-statement-range | clone-prone | scored | BLOCK | 1 | 0 |
| block6-pytest-test-address | clone-prone | scored | BLOCK | 2 | 0 |
| block6-pytest-xml-escape | clone-prone | scored | BLOCK | 3 | 0 |

See block-results/ for patches' application/check errors and block-review.json for the shared, suite-attributed review queue.

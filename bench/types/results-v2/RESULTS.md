# Type-aware checking gate results

**Deterministic tool-level evaluation, NOT an agent run.**

Preregistered manifest SHA256: `39a6b718d71443c161323b74d831d8f0dd1454071c04b7fdaddc1820d7fadc93`.
Frozen source/history: `fdc71900a4c47be2f52a2cb36a727609ca7331b1`. Current checker source hash: `da480f488b9e59ad151e69a44862546e34c6ddf6def8555d4c1bee8ade4ae876`.

## Summary: PASS

- Seeded errors caught as blocking: **A 31/93; B 84/93**.
- Designated-clean blocking findings: **A 1; B 1**, across 38 clean cases (35 reachable history commits + 3 reference solutions).
- Stop type-check component, 40 planned samples: **p50 41.601 ms; p95 1293.483 ms**, budget 4000 ms.
- Complete evaluation coverage: **yes**.

| Preregistered rule | Result |
| --- | --- |
| B catches strictly more seeded errors | PASS |
| B false blocks <= A false blocks | PASS |
| Combined Stop type-check p95 <= 4000 ms | PASS |

## Seeded errors by operator

| Operator | Mutations | A caught | B caught |
| --- | ---: | ---: | ---: |
| unknown-export | 16 | 16 | 16 |
| arity | 15 | 15 | 15 |
| return-member | 16 | 0 | 15 |
| argument-type | 16 | 0 | 11 |
| annotated-property | 15 | 0 | 15 |
| non-callable | 15 | 0 | 12 |

## Clean cases and false blocks

All blocking findings are listed below, including findings already emitted by A. These are designated-clean proxies, not independently certified bug-free programs.

| Case | Changed files | A blocks | B blocks | Complete |
| --- | ---: | ---: | ---: | --- |
| reference/customer-desk | 1 | 0 | 0 | yes |
| reference/parcel-ops | 1 | 0 | 0 | yes |
| reference/dispatch-desk | 1 | 0 | 0 | yes |
| history/212eefec80adb6f426d632cffc8503b2ee0f9c16 | 4 | 0 | 0 | yes |
| history/e9afde2dc19ec2a9eeecf930ef1e46f71275377c | 1 | 0 | 0 | yes |
| history/ac027d5ce6f57adee00ed82feab3d290890190a0 | 4 | 0 | 0 | yes |
| history/afaf7e48a522c101f73f671d19a0651a7c1d5940 | 4 | 0 | 0 | yes |
| history/940ec92e4f8d22a1351a8c6c2d417cc868308a13 | 4 | 0 | 0 | yes |
| history/5c4a682fbf4eb792686042dec07faf24c16d5f83 | 4 | 0 | 0 | yes |
| history/67587490d4462423c06dd99a4d7fc3e39a841531 | 4 | 0 | 0 | yes |
| history/3047c5589879e5922b223bb97e9ae2b4c2cc6595 | 4 | 0 | 0 | yes |
| history/3c3ae9555a969edcba5386a3fca75be086610f04 | 4 | 0 | 0 | yes |
| history/e5e3a46a40fe8c4f3766d6bb183f71e2f820df29 | 4 | 0 | 0 | yes |
| history/44e26408fb8a5592dbfc768c611f66349fb6fca4 | 1 | 0 | 0 | yes |
| history/995ae2aaaf2ef772cfbcc172ac5b8443b72ea3a5 | 3 | 0 | 0 | yes |
| history/a5df8bdf3eecc96a98e7e7e3f0606f67eb76b8bd | 2 | 0 | 0 | yes |
| history/57cc93763370090adbabbbcbceb5022b390eeeb3 | 2 | 0 | 0 | yes |
| history/2cab1e2ff0fcb335f61c2de9a30a348dd27ec171 | 2 | 0 | 0 | yes |
| history/df6bb7e57ea802b72a6827e03037f96b72b290fc | 4 | 0 | 0 | yes |
| history/08b129a75805a2c72143decad2641bcf5e69d56f | 2 | 0 | 0 | yes |
| history/e5d514cd15e12b6b4962f3eb4d56398c1f13b849 | 4 | 0 | 0 | yes |
| history/4610b60b4dbd83d4ee1777a75523d465135a2772 | 3 | 1 | 1 | yes |
| history/d44b79a2d7e52b7881bea4320f8cee188ec7ba6c | 3 | 0 | 0 | yes |
| history/4fec0a31bb64f7396dea21b4ba9a1cadc2c4125f | 1 | 0 | 0 | yes |
| history/43a663a7d2a6790bd9dd0d745968f0dc4b20e5d8 | 4 | 0 | 0 | yes |
| history/4f176edea87718ee1346e23b7861eb3764267c3d | 4 | 0 | 0 | yes |
| history/5c0d7146b60132fc691f4f3d54e40fa18cee1181 | 4 | 0 | 0 | yes |
| history/2dab274561541bf571c67fa43c04e8074040dc7c | 2 | 0 | 0 | yes |
| history/afcf331f4de57a4dff7d9db7b9cb3e4f43a2b8e7 | 2 | 0 | 0 | yes |
| history/f11dd0fda7a66f57f4445744aa051836149964de | 4 | 0 | 0 | yes |
| history/0932959e6eda753089df0a6999eb78994ae459d5 | 4 | 0 | 0 | yes |
| history/8640b2457a66d3354016398fba10a633dac75fdc | 4 | 0 | 0 | yes |
| history/ca55316b9e09b3a90be8623e6a3864697e6f133a | 4 | 0 | 0 | yes |
| history/426b94f65d2933578a209c5d0260b09eba1d2a5f | 4 | 0 | 0 | yes |
| history/47049038233f17a3966f8792dcb3f65d3040f525 | 2 | 0 | 0 | yes |
| history/061c6b3946eadbbc12c42e123617f04a3b96febb | 4 | 0 | 0 | yes |
| history/2d874a12973d65dccd3adeb3fcba3dd1b59ba1cd | 4 | 0 | 0 | yes |
| history/023b5c0e37454146dbbb964c876ca01a546da35f | 4 | 0 | 0 | yes |

### history/4610b60b4dbd83d4ee1777a75523d465135a2772

| Arm | Location | Source/code | Name | Message |
| --- | --- | --- | --- | --- |
| A (also B) | fixtures/reuse-check/delegating.ts:1 | grounding/missing-module | ./utils.js | module './utils.js' does not exist. |

## Stop type-check timings

Type component only, not total Stop dispatch, index refresh, or agent latency. Nearest-rank percentiles; no outliers removed.

| Mode | Samples | p50 ms | p95 ms | Timeouts/unavailable |
| --- | ---: | ---: | ---: | ---: |
| cold | 20 | 1162.996 | 1293.537 | 0 |
| warm | 20 | 18.195 | 23.102 | 0 |

Warm-up (excluded by preregistration): 1168.54 ms.

| Sample | Mode | ms | Timed out |
| ---: | --- | ---: | --- |
| 1 | cold | 1134.786 | false |
| 2 | cold | 1118.808 | false |
| 3 | cold | 1198.045 | false |
| 4 | cold | 1148.123 | false |
| 5 | cold | 1441.95 | false |
| 6 | cold | 1235.81 | false |
| 7 | cold | 1114.433 | false |
| 8 | cold | 1155.605 | false |
| 9 | cold | 1185.451 | false |
| 10 | cold | 1138.669 | false |
| 11 | cold | 1202.678 | false |
| 12 | cold | 1162.996 | false |
| 13 | cold | 1293.483 | false |
| 14 | cold | 1186.925 | false |
| 15 | cold | 1227.36 | false |
| 16 | cold | 1130.343 | false |
| 17 | cold | 1168.329 | false |
| 18 | cold | 1153.105 | false |
| 19 | cold | 1293.537 | false |
| 20 | cold | 1088.872 | false |
| 21 | warm | 18.24 | false |
| 22 | warm | 19.276 | false |
| 23 | warm | 18.504 | false |
| 24 | warm | 23.102 | false |
| 25 | warm | 13.565 | false |
| 26 | warm | 14.148 | false |
| 27 | warm | 16.31 | false |
| 28 | warm | 18.195 | false |
| 29 | warm | 18.012 | false |
| 30 | warm | 41.601 | false |
| 31 | warm | 23.049 | false |
| 32 | warm | 18.625 | false |
| 33 | warm | 13.511 | false |
| 34 | warm | 12.832 | false |
| 35 | warm | 12.607 | false |
| 36 | warm | 12.604 | false |
| 37 | warm | 12.845 | false |
| 38 | warm | 19.433 | false |
| 39 | warm | 20.359 | false |
| 40 | warm | 20.814 | false |

## Incomplete evaluations / errors

None.

## Interpretation and limitations

- 35 reachable non-merge history commits were frozen and evaluated. No unmerged history was used.
- V2 exists because v1 designated intentionally broken fixtures as clean. V2 excludes bad-prefixed path components and files with // expect: or # expect: annotations in either parent or commit. Up to four SHA-ranked eligible changed files per commit balance coverage; exact selections and exclusions are frozen in mutations-v2.json. This changes the evaluation, not the checker; do not pool v1 and v2 results.
- V2 has seed 29061993 and no exact repo/file/before/after mutation overlap with v1. Sites and operator families may overlap; this is not an independent population sample.
- Historical workspaces use their own source/config but the same currently installed development dependencies, not reconstructed historical installs. Dependency/compiler skew can create diagnostics; no such rows are removed.
- This is a fixed seeded corpus and a designated-clean proxy, not a population precision estimate or agent success evaluation. A failure is published without tuning the checker.
- Types remain Stop-only by default (`types.postToolHook: false`). No PostToolUse latency claim is made, and this evaluation does not authorize enabling that hook.
- Post-registration checker fixes (requested after analysis of v1): files matching grounding's shared DYNAMIC_TEXT signal retain type diagnostics as info; TS 2307 is no longer blocking because grounding owns missing modules. These are general precision policies, not filename/corpus exceptions. Full v1 rerun uses the unchanged frozen manifest and original scoring rules; earlier runs remain archived.
- Earlier v1 runner-only corrections validated anchor/history reachability and restricted reference changed-file metadata to its workflow target. Earlier runs are archived. V2 additionally consumes preregistered file selections and uses a separate hash-checked manifest and output directory.
- Environment: {"node":"v24.22.2","typescript":"5.9.3","pyright":"pyright 1.1.414","platform":"linux 6.8.0-1060-aws","cpu":"Intel(R) Xeon(R) Processor"}.
- Raw per-mutation findings, availability, clean cases, warm-up and samples: `results.json`.

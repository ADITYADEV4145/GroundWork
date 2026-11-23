# Type-aware checking gate results

**Deterministic tool-level evaluation, NOT an agent run.**

Preregistered manifest SHA256: `278f41bc48e4ce996f960cef49b60567814a7c47569d439e5191be72009dbdc0`.
Frozen source/history: `afaf7e48a522c101f73f671d19a0651a7c1d5940`. Current checker source hash: `da480f488b9e59ad151e69a44862546e34c6ddf6def8555d4c1bee8ade4ae876`.

## Summary: INCOMPLETE

- Seeded errors caught as blocking: **A 32/94; B 90/94**.
- Designated-clean blocking findings: **A 16; B 18**, across 35 clean cases (32 reachable history commits + 3 reference solutions).
- Stop type-check component, 40 planned samples: **p50 27.802 ms; p95 1260.817 ms**, budget 4000 ms.
- Complete evaluation coverage: **no**.

| Preregistered rule | Result |
| --- | --- |
| B catches strictly more seeded errors | PASS |
| B false blocks <= A false blocks | FAIL |
| Combined Stop type-check p95 <= 4000 ms | PASS |

## Seeded errors by operator

| Operator | Mutations | A caught | B caught |
| --- | ---: | ---: | ---: |
| unknown-export | 16 | 16 | 16 |
| arity | 16 | 16 | 16 |
| return-member | 16 | 0 | 14 |
| argument-type | 16 | 0 | 16 |
| annotated-property | 15 | 0 | 15 |
| non-callable | 15 | 0 | 13 |

## Clean cases and false blocks

All blocking findings are listed below, including findings already emitted by A. These are designated-clean proxies, not independently certified bug-free programs.

| Case | Changed files | A blocks | B blocks | Complete |
| --- | ---: | ---: | ---: | --- |
| reference/customer-desk | 1 | 0 | 0 | yes |
| reference/parcel-ops | 1 | 0 | 0 | yes |
| reference/dispatch-desk | 1 | 0 | 0 | yes |
| history/afaf7e48a522c101f73f671d19a0651a7c1d5940 | 21 | 0 | 0 | yes |
| history/940ec92e4f8d22a1351a8c6c2d417cc868308a13 | 5 | 0 | 0 | yes |
| history/5c4a682fbf4eb792686042dec07faf24c16d5f83 | 24 | 0 | 0 | yes |
| history/67587490d4462423c06dd99a4d7fc3e39a841531 | 22 | 0 | 0 | yes |
| history/3047c5589879e5922b223bb97e9ae2b4c2cc6595 | 24 | 0 | 0 | yes |
| history/3c3ae9555a969edcba5386a3fca75be086610f04 | 8 | 0 | 0 | yes |
| history/e5e3a46a40fe8c4f3766d6bb183f71e2f820df29 | 63 | 0 | 0 | yes |
| history/44e26408fb8a5592dbfc768c611f66349fb6fca4 | 1 | 0 | 0 | yes |
| history/995ae2aaaf2ef772cfbcc172ac5b8443b72ea3a5 | 3 | 0 | 0 | yes |
| history/a5df8bdf3eecc96a98e7e7e3f0606f67eb76b8bd | 2 | 0 | 0 | yes |
| history/57cc93763370090adbabbbcbceb5022b390eeeb3 | 2 | 0 | 0 | yes |
| history/2cab1e2ff0fcb335f61c2de9a30a348dd27ec171 | 2 | 0 | 0 | yes |
| history/df6bb7e57ea802b72a6827e03037f96b72b290fc | 4 | 0 | 0 | yes |
| history/08b129a75805a2c72143decad2641bcf5e69d56f | 2 | 0 | 0 | yes |
| history/e5d514cd15e12b6b4962f3eb4d56398c1f13b849 | 5 | 0 | 0 | yes |
| history/4610b60b4dbd83d4ee1777a75523d465135a2772 | 3 | 1 | 1 | yes |
| history/d44b79a2d7e52b7881bea4320f8cee188ec7ba6c | 3 | 0 | 0 | yes |
| history/4fec0a31bb64f7396dea21b4ba9a1cadc2c4125f | 1 | 0 | 0 | yes |
| history/43a663a7d2a6790bd9dd0d745968f0dc4b20e5d8 | 9 | 0 | 0 | yes |
| history/4f176edea87718ee1346e23b7861eb3764267c3d | 11 | 0 | 0 | yes |
| history/5c0d7146b60132fc691f4f3d54e40fa18cee1181 | 6 | 0 | 0 | yes |
| history/2dab274561541bf571c67fa43c04e8074040dc7c | 2 | 0 | 0 | yes |
| history/afcf331f4de57a4dff7d9db7b9cb3e4f43a2b8e7 | 2 | 0 | 0 | yes |
| history/f11dd0fda7a66f57f4445744aa051836149964de | 30 | 0 | 0 | yes |
| history/0932959e6eda753089df0a6999eb78994ae459d5 | 34 | 0 | 0 | yes |
| history/8640b2457a66d3354016398fba10a633dac75fdc | 13 | 0 | 0 | yes |
| history/ca55316b9e09b3a90be8623e6a3864697e6f133a | 121 | 0 | 0 | no |
| history/426b94f65d2933578a209c5d0260b09eba1d2a5f | 35 | 15 | 17 | yes |
| history/47049038233f17a3966f8792dcb3f65d3040f525 | 2 | 0 | 0 | yes |
| history/061c6b3946eadbbc12c42e123617f04a3b96febb | 14 | 0 | 0 | yes |
| history/2d874a12973d65dccd3adeb3fcba3dd1b59ba1cd | 16 | 0 | 0 | yes |
| history/023b5c0e37454146dbbb964c876ca01a546da35f | 70 | 0 | 0 | yes |

### history/4610b60b4dbd83d4ee1777a75523d465135a2772

| Arm | Location | Source/code | Name | Message |
| --- | --- | --- | --- | --- |
| A (also B) | fixtures/reuse-check/delegating.ts:1 | grounding/missing-module | ./utils.js | module './utils.js' does not exist. |

### history/426b94f65d2933578a209c5d0260b09eba1d2a5f

| Arm | Location | Source/code | Name | Message |
| --- | --- | --- | --- | --- |
| A (also B) | fixtures/grounding-ts/src/bad.ts:1 | grounding/unknown-export | findByEmail | 'findByEmail' is not exported in fixtures/grounding-ts/src/lib/users.ts. Did you mean getUserByEmail (fixtures/grounding-ts/src/lib/users.ts:8, getUserByEmail(email: string): User \| null) or findSymbols (src/index/query.ts:122, findSymbols(db: Db, ref: string): SymbolHit[])? |
| A (also B) | fixtures/grounding-ts/src/bad.ts:2 | grounding/unknown-export | nope | 'nope' is not exported in fixtures/grounding-ts/src/lib/index.ts. |
| A (also B) | fixtures/grounding-ts/src/bad.ts:3 | grounding/unknown-export | default | no default export in fixtures/grounding-ts/src/lib/math.ts. |
| A (also B) | fixtures/grounding-ts/src/bad.ts:4 | grounding/missing-module | ./lib/nowhere | module './lib/nowhere' does not exist. |
| A (also B) | fixtures/grounding-ts/src/bad.ts:14 | grounding/arity | math.add | math.add() takes 2 arguments, got 1 — add(a: number, b: number): number (fixtures/grounding-ts/src/lib/math.ts:1). |
| A (also B) | fixtures/grounding-ts/src/bad.ts:15 | grounding/arity | math.add | math.add() takes 2 arguments, got 3 — add(a: number, b: number): number (fixtures/grounding-ts/src/lib/math.ts:1). |
| A (also B) | fixtures/grounding-ts/src/bad.ts:16 | grounding/arity | math.scale | math.scale() takes 1-2 arguments, got 0 — scale(x: number, factor = 2): number (fixtures/grounding-ts/src/lib/math.ts:9). |
| A (also B) | fixtures/grounding-ts/src/bad.ts:18 | grounding/arity | byEmail | byEmail() takes 1 argument, got 2 — getUserByEmail(email: string): User \| null (fixtures/grounding-ts/src/lib/users.ts:8). |
| A (also B) | fixtures/grounding-ts/src/bad2.ts:12 | grounding/arity | add | add() takes 2 arguments, got 1 — add(a: number, b: number): number (fixtures/grounding-ts/src/lib/math.ts:1). |
| A (also B) | fixtures/grounding-ts/src/bad2.ts:13 | grounding/arity | scale | scale() takes 1-2 arguments, got 3 — scale(x: number, factor = 2): number (fixtures/grounding-ts/src/lib/math.ts:9). |
| A (also B) | fixtures/grounding-ts/src/bad2.ts:14 | grounding/arity | createUser | createUser() takes at least 1 arguments, got 0 — createUser(name: string, email?: string, ...tags: string[]): User (fixtures/grounding-ts/src/lib/users.ts:12). |
| A (also B) | fixtures/grounding-ts/src/bad2.ts:16 | grounding/arity | UserStore | UserStore() takes 1 argument, got 2 — class UserStore (fixtures/grounding-ts/src/lib/users.ts:16). |
| A (also B) | fixtures/grounding-ts/src/bad3.ts:1 | grounding/unknown-export | default | no default export in fixtures/grounding-ts/src/lib/star-only.ts. |
| A (also B) | fixtures/grounding-ts/src/bad3.ts:7 | grounding/arity | add | add() takes 2 arguments, got 1 — add(a: number, b: number): number (fixtures/grounding-ts/src/lib/math.ts:1). |
| A (also B) | fixtures/grounding-ts/src/bad3.ts:12 | grounding/arity | pair | pair() takes 2 arguments, got 1 — pair(a: number, b: number): number (fixtures/grounding-ts/src/lib/configured.ts:1). |
| B only | fixtures/grounding-ts/src/bad2.ts:6 | types/2339 | fetchAll | Property 'fetchAll' does not exist on type 'AdminStore'. |
| B only | fixtures/grounding-ts/src/bad2.ts:7 | types/2339 | save | Property 'save' does not exist on type 'AdminStore'. |

## Stop type-check timings

Type component only, not total Stop dispatch, index refresh, or agent latency. Nearest-rank percentiles; no outliers removed.

| Mode | Samples | p50 ms | p95 ms | Timeouts/unavailable |
| --- | ---: | ---: | ---: | ---: |
| cold | 20 | 1155.593 | 1271.253 | 0 |
| warm | 20 | 16.345 | 21.254 | 0 |

Warm-up (excluded by preregistration): 1152.347 ms.

| Sample | Mode | ms | Timed out |
| ---: | --- | ---: | --- |
| 1 | cold | 1144.261 | false |
| 2 | cold | 1126.071 | false |
| 3 | cold | 1135.483 | false |
| 4 | cold | 1355.235 | false |
| 5 | cold | 1237.964 | false |
| 6 | cold | 1271.253 | false |
| 7 | cold | 1128.778 | false |
| 8 | cold | 1141.046 | false |
| 9 | cold | 1252.203 | false |
| 10 | cold | 1169.539 | false |
| 11 | cold | 1148.897 | false |
| 12 | cold | 1260.817 | false |
| 13 | cold | 1183.493 | false |
| 14 | cold | 1168.94 | false |
| 15 | cold | 1137.807 | false |
| 16 | cold | 1151.207 | false |
| 17 | cold | 1194.534 | false |
| 18 | cold | 1155.593 | false |
| 19 | cold | 1238.732 | false |
| 20 | cold | 1112.356 | false |
| 21 | warm | 21.254 | false |
| 22 | warm | 27.802 | false |
| 23 | warm | 16.345 | false |
| 24 | warm | 17.013 | false |
| 25 | warm | 16.795 | false |
| 26 | warm | 16.634 | false |
| 27 | warm | 16.629 | false |
| 28 | warm | 17.784 | false |
| 29 | warm | 13.148 | false |
| 30 | warm | 13.225 | false |
| 31 | warm | 13.361 | false |
| 32 | warm | 13.084 | false |
| 33 | warm | 13.128 | false |
| 34 | warm | 19.689 | false |
| 35 | warm | 20.811 | false |
| 36 | warm | 17.599 | false |
| 37 | warm | 12.919 | false |
| 38 | warm | 12.999 | false |
| 39 | warm | 12.832 | false |
| 40 | warm | 12.731 | false |

## Incomplete evaluations / errors

- history/ca55316b9e09b3a90be8623e6a3864697e6f133a: typescript: timeout; type timeout

## Interpretation and limitations

- Only 32 reachable non-merge commits touch tracked TypeScript files; all 32 were frozen and evaluated, per the approved widened rule. No unmerged history was used.
- Historical workspaces use their own source/config but the same currently installed development dependencies, not reconstructed historical installs. Dependency/compiler skew can create diagnostics; no such rows are removed.
- This is a fixed seeded corpus and a designated-clean proxy, not a population precision estimate or agent success evaluation. A failure is published without tuning the checker.
- Types remain Stop-only by default (`types.postToolHook: false`). No PostToolUse latency claim is made, and this evaluation does not authorize enabling that hook.
- Post-registration checker fixes (requested after analysis of v1): files matching grounding's shared DYNAMIC_TEXT signal retain type diagnostics as info; TS 2307 is no longer blocking because grounding owns missing modules. These are general precision policies, not filename/corpus exceptions. Full v1 rerun uses the unchanged frozen manifest and original scoring rules; earlier runs remain archived.
- Runner-only correction after the initial run: explicitly validate anchor/history reachability and restrict reference changed-file metadata to its workflow target (excluding the unsupported dependency symlink). Both full runs are retained; checker policy, corpus and scoring are unchanged.
- Environment: {"node":"v24.22.2","typescript":"5.9.3","pyright":"pyright 1.1.414","platform":"linux 6.8.0-1060-aws","cpu":"Intel(R) Xeon(R) Processor"}.
- Raw per-mutation findings, availability, clean cases, warm-up and samples: `results.json`.

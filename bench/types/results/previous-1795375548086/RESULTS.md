# Type-aware checking gate results

**Deterministic tool-level evaluation, NOT an agent run.**

Preregistered manifest SHA256: `278f41bc48e4ce996f960cef49b60567814a7c47569d439e5191be72009dbdc0`.
Frozen source/history: `afaf7e48a522c101f73f671d19a0651a7c1d5940`. Current checker source hash: `66fa10e796f050e749e84f8ab58f6f8c00da6de819065ce9d357a66e999d157c`.

## Summary: INCOMPLETE

- Seeded errors caught as blocking: **A 32/94; B 93/94**.
- Designated-clean blocking findings: **A 16; B 21**, across 35 clean cases (32 reachable history commits + 3 reference solutions).
- Stop type-check component, 40 planned samples: **p50 46.164 ms; p95 1363.391 ms**, budget 4000 ms.
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
| return-member | 16 | 0 | 15 |
| argument-type | 16 | 0 | 16 |
| annotated-property | 15 | 0 | 15 |
| non-callable | 15 | 0 | 15 |

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
| history/e5e3a46a40fe8c4f3766d6bb183f71e2f820df29 | 63 | 0 | 1 | yes |
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
| history/426b94f65d2933578a209c5d0260b09eba1d2a5f | 35 | 15 | 19 | yes |
| history/47049038233f17a3966f8792dcb3f65d3040f525 | 2 | 0 | 0 | yes |
| history/061c6b3946eadbbc12c42e123617f04a3b96febb | 14 | 0 | 0 | yes |
| history/2d874a12973d65dccd3adeb3fcba3dd1b59ba1cd | 16 | 0 | 0 | yes |
| history/023b5c0e37454146dbbb964c876ca01a546da35f | 70 | 0 | 0 | yes |

### history/e5e3a46a40fe8c4f3766d6bb183f71e2f820df29

| Arm | Location | Source/code | Name | Message |
| --- | --- | --- | --- | --- |
| B only | fixtures/grounding-ts/src/good-build-output.ts:1 | types/2307 | ../compiled/client.js | Cannot find module '../compiled/client.js' or its corresponding type declarations. |

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
| B only | fixtures/grounding-ts/src/good-review.ts:40 | types/2554 | m | Expected 1 arguments, but got 0. |
| B only | fixtures/grounding-ts/src/good-template.ts:6 | types/2554 | go | Expected 1 arguments, but got 0. |

## Stop type-check timings

Type component only, not total Stop dispatch, index refresh, or agent latency. Nearest-rank percentiles; no outliers removed.

| Mode | Samples | p50 ms | p95 ms | Timeouts/unavailable |
| --- | ---: | ---: | ---: | ---: |
| cold | 20 | 1168.988 | 1459.46 | 0 |
| warm | 20 | 28.459 | 40.572 | 0 |

Warm-up (excluded by preregistration): 1243.091 ms.

| Sample | Mode | ms | Timed out |
| ---: | --- | ---: | --- |
| 1 | cold | 1081.814 | false |
| 2 | cold | 1134.031 | false |
| 3 | cold | 1106.944 | false |
| 4 | cold | 1084.639 | false |
| 5 | cold | 1159.39 | false |
| 6 | cold | 1168.988 | false |
| 7 | cold | 1174.122 | false |
| 8 | cold | 1234.304 | false |
| 9 | cold | 1363.391 | false |
| 10 | cold | 1182.241 | false |
| 11 | cold | 1266.522 | false |
| 12 | cold | 1305.675 | false |
| 13 | cold | 1139.901 | false |
| 14 | cold | 1092.012 | false |
| 15 | cold | 1170.848 | false |
| 16 | cold | 1073.915 | false |
| 17 | cold | 1242.163 | false |
| 18 | cold | 1641.188 | false |
| 19 | cold | 1459.46 | false |
| 20 | cold | 1142.957 | false |
| 21 | warm | 25.638 | false |
| 22 | warm | 46.164 | false |
| 23 | warm | 27.116 | false |
| 24 | warm | 25.027 | false |
| 25 | warm | 31.549 | false |
| 26 | warm | 31.388 | false |
| 27 | warm | 34.841 | false |
| 28 | warm | 40.572 | false |
| 29 | warm | 35.87 | false |
| 30 | warm | 28.407 | false |
| 31 | warm | 28.861 | false |
| 32 | warm | 24.138 | false |
| 33 | warm | 28.459 | false |
| 34 | warm | 34.487 | false |
| 35 | warm | 33.734 | false |
| 36 | warm | 30.591 | false |
| 37 | warm | 20.266 | false |
| 38 | warm | 23.638 | false |
| 39 | warm | 20.825 | false |
| 40 | warm | 20.192 | false |

## Incomplete evaluations / errors

- history/ca55316b9e09b3a90be8623e6a3864697e6f133a: typescript: timeout; type timeout

## Interpretation and limitations

- Only 32 reachable non-merge commits touch tracked TypeScript files; all 32 were frozen and evaluated, per the approved widened rule. No unmerged history was used.
- Historical workspaces use their own source/config but the same currently installed development dependencies, not reconstructed historical installs. Dependency/compiler skew can create diagnostics; no such rows are removed.
- This is a fixed seeded corpus and a designated-clean proxy, not a population precision estimate or agent success evaluation. A failure is published without tuning the checker.
- Types remain Stop-only by default (`types.postToolHook: false`). No PostToolUse latency claim is made, and this evaluation does not authorize enabling that hook.
- Post-registration checker fixes: none. The preregistered Stop-output filter fix affects presentation only, not either arm's blocking decisions.
- Runner-only correction after the initial run: explicitly validate anchor/history reachability and restrict reference changed-file metadata to its workflow target (excluding the unsupported dependency symlink). Both full runs are retained; checker policy, corpus and scoring are unchanged.
- Environment: {"node":"v24.22.2","typescript":"5.9.3","pyright":"pyright 1.1.414","platform":"linux 6.8.0-1060-aws","cpu":"Intel(R) Xeon(R) Processor"}.
- Raw per-mutation findings, availability, clean cases, warm-up and samples: `results.json`.

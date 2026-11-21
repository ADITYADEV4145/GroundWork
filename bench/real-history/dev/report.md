# Expanded development history: action-class evidence

**Evidence only. Agent-reviewed, not human-approved. No detector, weights, thresholds or reserved evaluation changed.**

## Targets and search yield

Searched **6166 distinct non-merge commits** across nine pinned permissive TS/Python repositories (1,972 from step 1; the rest new). Found **1529 raw proposals**, not labels. Stopping at the requested approximately 6k-commit search budget: **8/20 positive families, 3/6 TS positive families, 0/8 unchanged direct-reuse families**. These targets are **not met**. Pair combinations never count as separate families. Proposals are not exhaustively reviewed: only the families below carry reviewed labels. The production-path heuristic also admits test infrastructure under TypeScript's src/testRunner; raw proposal counts must not be read as production-only yield.

| Repository / window (UTC, end exclusive) | Start / end pins | Commits | Proposals (events) | Direct / extract / different / unknown families |
| --- | --- | ---: | ---: | ---: |
| [zod](https://github.com/colinhacks/zod.git), 2025-01-01–2025-07-01 / MIT | `f7ad26147ba291cb3fb257545972a8e00e767470`<br>`1b0a5e589afd6ac913b0eddc3aa615224a1495c2` | 338 | 495 (1) | 0 / 0 / 6 / 0 |
| [pydantic](https://github.com/pydantic/pydantic.git), 2025-01-01–2025-07-01 / MIT | `59b35de6564af0a971aae99807f0f562fa051e3e`<br>`42298a08b4cb999242b2ce231adda03539858567` | 216 | 24 (7) | 0 / 0 / 4 / 1 |
| [django](https://github.com/django/django.git), 2025-01-01–2025-07-01 / BSD-3-Clause | `8d9901c961bf9d5cfa6bddddbbcebfbf487a5125`<br>`192bc7a7be92e20cc250907fb4083df689715679` | 482 | 406 (28) | 0 / 3 / 1 / 0 |
| [scikit-learn](https://github.com/scikit-learn/scikit-learn.git), 2025-01-01–2025-07-01 / BSD-3-Clause | `74775cac41cb299d029417d0b06d2cd25ec8f1fc`<br>`6eeb16782ba417b2a00c436da0b83edadfcd7575` | 562 | 134 (13) | 0 / 2 / 1 / 0 |
| [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint.git), 2025-01-01–2025-07-01 / MIT | `4dbf48b8eec0321babb4293a1be71b54dd00c018`<br>`f9bd7d86fc39eb2957de7eefdcd3ab9b6c9dc4a7` | 374 | 22 (5) | 0 / 0 / 7 / 0 |
| [typescript](https://github.com/microsoft/TypeScript.git), 2024-01-01–2025-07-01 / Apache-2.0 | `f2e9ebd1b7e6f8e11ab23631f7b2df4346708535`<br>`3ba257fface990ec5ec59fa2bb8edd7a721e1013` | 1078 | 294 (50) | 0 / 1 / 0 / 0 |
| [vite](https://github.com/vitejs/vite.git), 2024-01-01–2025-07-01 / MIT | `8de7bd2b68db27b83d9484cc8d4e26436615168e`<br>`3e81af38a80c7617aba6bf3300d8b4267570f9cf` | 1527 | 81 (22) | 0 / 2 / 1 / 0 |
| [vue](https://github.com/vuejs/core.git), 2024-01-01–2025-07-01 / MIT | `24d77c25ce5d5356adb5367beef1d23e6e340b35`<br>`ba391f5fdf5d84bfacaca6a2a3e7057fc99efa34` | 1195 | 17 (8) | 0 / 0 / 1 / 1 |
| [pandas](https://github.com/pandas-dev/pandas.git), 2025-01-01–2025-07-01 / BSD-3-Clause | `8fbe6ac83da590acfc58ff83713aac14ab7f900d`<br>`0ab10aa1417f19ecf265ff9383b1aa851b02736b` | 394 | 56 (5) | 0 / 0 / 0 / 0 |

The unchanged step-1 five-repo window remains January–June 2025. TypeScript, Vite and Vue add January 2024–June 2025; pandas adds January–June 2025. Source lives externally under `GW_REAL_HISTORY_CACHE`. TypeScript's first unbounded attempt was stopped for cost; the completed search skips files above its manifest's 200,000-byte cap (**1797 distinct revision:file versions**). This includes large compiler files such as checker.ts: commit metadata was searched, **not every function in those files**. Parse failures, short bodies and name-only callee matching further limit mining recall. No stronger full-source coverage is claimed.

## Family labels and deduplication

[families.json](families.json) defines one representative and all member IDs per family. Positive events are deduplicated by repository/commit, including the 21 correlated backend pairs as one family. Negatives group conservatively by normal commit. Every labelled pair and one-line reason is in [pairs.md](pairs.md); exact references/hashes and action labels are in the JSON files. The backend family is vendored array-api-compat code with its own MIT license.

| Family | Repo / commit | Action | Reason (representative) |
| --- | --- | --- | --- |
| zod:d9f76e1122e08f1675c33f2794cc25e806c3f0f8 | zod / `d9f76e1122e0` | related-different | rest preserves an existing v3 tuple definition while changing its rest schema; _tuple constructs a v4 schema from a Class and item list. Inputs, definition format and version boundary differ. |
| zod:1780c67e9cfeb1c94ef4e18fc8e93f22a3e114c0 | zod / `1780c67e9cfe` | related-different | init registers traits, invokes the initializer and binds prototype methods; the bundled initializer installs error issues. Their writes and responsibilities differ, and source must not depend on a generated bundle. |
| zod:3a8edd7470a550b55aeefa365c6d3ebbd6583910 | zod / `3a8edd7470a5` | related-different | Enum parsing validates strings and membership, caches allowed values and can succeed; the BigInt helper unconditionally reports an invalid bigint and returns INVALID. |
| zod:24a5e4f329378ebd035a19a678e7b24e52036829 | zod / `24a5e4f32937` | related-different | The v3 factory processes error parameters and creates a v3 typeName definition; the generated v4 bundle uses a different definition contract and omits those parameters. Sharing an intersection name is insufficient. |
| zod:7ed0c3694d324f5c02d5b224e7e3163d2fd84c52 | zod / `7ed0c3694d32` | related-different | The changed v4 datetime accepts hours-only offsets using ([+-]\d{2}(?::?\d{2})?), whereas v3 datetimeRegex requires minutes. They also call different time/date sources. Their normalized structure is identical but substituting the old regex would undo the commit's fix. |
| zod:11477ae593b0a01ab7e701f39d69ce170936a216 | zod / `11477ae593b0` | related-different | The full v4 formatter creates and returns fieldErrors and maps new union/key/element issue layouts; the v3 nested processError returns void, requires captured mapper/fieldErrors, and reads unionErrors/returnTypeError/argumentsError. Shared traversal is not the same callable contract. |
| pydantic-alias-move-unknown | pydantic / `d992117243b3` | unknown | GenerateSchema._apply_alias_generator_to_field_info / GenerateSchema._apply_alias_generator_to_computed_field_info: The broader deleted-body miner proposes these at structure 0.859. Inspection shows two different implementations moved to _fields.py and ComputedFieldInfo respectively, not consolidated into one. The computed field only sets a serialization-oriented alias, while FieldInfo handles validation and serialization aliases separately. This commit is not positive reuse proof; withhold rather than turn a mining proposal into a permissive-detector negative. |
| pydantic:55a434c41b1ad2af95584ae8c8c17d364add181f | pydantic / `55a434c41b1a` | related-different | _apply_parse builds a parsing chain and handles strict annotations and the field-type marker; _check_func installs a value predicate that can raise ValueError. Their validators implement different contracts. |
| pydantic:588436ec2609ce488e3810a91a55cf29b9dd81d6 | pydantic / `588436ec2609` | related-different | get_callable_return_type unwraps callable objects, collects return hints and can return PydanticUndefined; eval_type converts and evaluates one annotation value. The latter does not perform the former's discovery. |
| pydantic:1dcddac2c5e1ac2361fc897f804f44338a1d8067 | pydantic / `1dcddac2c5e1` | related-different | _Definitions contains finalize_schema in the same source range. The class owns definition storage and other operations; its own finalization method cannot replace that class. |
| pydantic:cbf4202637a56fc5325ab4b18452e3f3ba910a84 | pydantic / `cbf4202637a5` | related-different | PydanticModelField encloses to_argument. A field metadata class and its argument-conversion method are not independent interchangeable definitions. |
| django-mail-recipients | django / `90fc76294808` | extract/extend | mail_admins / mail_managers: The two functions duplicate recipient validation, EmailMultiAlternatives construction, HTML attachment and sending; ADMINS versus MANAGERS is the configuration difference. The commit extracts _send_server_message(setting_name=...) and both wrappers call it. Calling mail_managers from mail_admins unchanged would send to the wrong recipients, so this is helper-extraction evidence, not direct-call equivalence. |
| django-expression-resolution | django / `a76035e925ff` | extract/extend | Func.resolve_expression / BaseExpression.resolve_expression: Both before implementations copy self, set is_summary and resolve child expressions. The commit moves Func's composite-expression validation into BaseExpression and deletes Func's override, inheriting the generalized implementation. This is an author-performed consolidation, but before-state BaseExpression lacks Func's validation: direct replacement without extending it would be unsafe. |
| django-log-assertions | django / `9d72e7daf729` | extract/extend | LogResponseRealLoggerTests.assertResponseLogged / LoggingAssertionMixin.assertLogRecord: Both before helpers validate one captured record, its message and status. The commit extends assertLogRecord with level/request checks and a return value, makes LogResponseRealLoggerTests inherit the mixin and replaces every assertResponseLogged call. Real duplicate assertion logic is consolidated; the old target alone lacks checks and a return value, so it is not a safe unchanged replacement. Test-only evidence, outside the production skipTests population. |
| django:f920937c8a63df6bea220e4386f59cdb45b2e355 | django / `f920937c8a63` | related-different | RoutePattern encloses check, verified by source ranges and qualified names. A validation method cannot replace the route-pattern class and its matching interface. |
| sklearn-backend-predicates | scikit-learn / `9b40cbce33ed` | extract/extend | is_numpy_array / is_cupy_array: Both before bodies repeat the loaded-module guard, import and class-membership predicate. The commit replaces that repeated core with _issubclass_fast(type(x), module, class), retaining NumPy/Jax zero-gradient specialization. This is a real parameterized helper extraction, NOT evidence that one backend predicate can call another unchanged. All 21 pairs are ONE correlated refactor family in vendored MIT-licensed code (array_api_compat/LICENSE). |
| sklearn-cv-tag-parent | scikit-learn / `446adff13b9a` | extract/extend | LassoCV.__sklearn_tags__ / ElasticNetCV.__sklearn_tags__: The two identical overrides set target_tags.multi_output=False on parent tags. The author removes both and adds a LinearModelCV implementation parameterized by _is_multitask(), also correcting sparse flags. This is one inheritance/generalization event across CV estimators, not permission to call a sibling's super()-capturing method unchanged. |
| scikit-learn:119ade27a6a2179bed33a73ef0d1f6b3db602d79 | scikit-learn / `119ade27a6a2` | related-different | The example scoring adapter calls estimator.predict and returns a dictionary for cross-validation. class_likelihood_ratios consumes two label arrays, computes confusion-matrix ratios, and returns a numeric tuple. Caller and callee are not interchangeable. |
| typescript-eslint:1c73754f70dc44e329453dea55f7eb36225abcbb | typescript-eslint / `1c73754f70dc` | related-different | The first returns whether a template literal has expressions; checkExpression dispatches multiple AST kinds to formatting checks and returns void. It is an effectful visitor rather than a predicate. |
| typescript-eslint:9a9670dd1bcce833900b9273b81ef9cbfb9b722f | typescript-eslint / `9a9670dd1bcc` | related-different | isDefinitionFile returns a case-normalized declaration-file predicate including arbitrary .d.*.ts names; getExtension returns a case-sensitive suffix or null. Their outputs and matching rules differ. |
| typescript-eslint:586e7eb20a2c91564abfeb1c3631f74e45b37140 | typescript-eslint / `586e7eb20a2c` | related-different | One checks imported external-module interface/type-alias merging using scope; the other applies the ignoreTypeValueShadow option and compares value/type variable categories. They answer different shadowing questions. |
| typescript-eslint:04166e034b19f2aec4bf4a54fc36d636854fdac8 | typescript-eslint / `04166e034b19` | related-different | Spread checking reports disallowed string spreading; throw checking accepts configured any/unknown/Error-like types and reports invalid thrown values. Shared checker/report APIs do not make their validation policies duplicates. |
| typescript-eslint:e4532c7fa3becd3cb1e11cdc253cbc3d8be02f78 | typescript-eslint / `e4532c7fa3be` | related-different | specifierNameMatches compares TypeScript type symbol/intrinsic names against specifiers; isIdentifier checks an ESTree Identifier node and its spelling. The two compiler representations and resolution semantics differ. |
| typescript-eslint:4ad8a0713376e5b88c56997312861a2c8cb049ab | typescript-eslint / `4ad8a0713376` | related-different | populateProjectService normalizes options, validates globs and lazily initializes a cached service; validateDefaultProjectForFilesGlob only rejects broad patterns and returns void. This is orchestration versus an already-called validation step. |
| typescript-eslint:fa265a970535e9b8d3ac8bfde9f3a24f1a1ec94a | typescript-eslint / `fa265a970535` | related-different | teardown conditionally removes INTEGRATION_TEST_DIR; setup creates fixture/tar/temp directories, packs packages, writes dependency configuration and installs fixtures. These are opposite lifecycle effects, not redundant implementations. |
| typescript-parent-diagnostic-info | typescript / `8537bb72eb7f` | extract/extend | createGetIsolatedDeclarationErrors.createObjectLiteralError / createGetIsolatedDeclarationErrors.createArrayLiteralError: Both old functions create a diagnostic, find its nearest declaration, derive a target name, attach the same parent-related info, and return it. The author extracts the repeated attachment into addParentDeclarationRelatedInfo(node, diag), also extending missing-name and ancestor handling. This is one compiler helper-extraction event; the new helper and changed ancestor logic rule out unchanged direct-call reuse. |
| vite-shared-runtime-utils | vite / `b20d54257e61` | extract/extend | wrapId / wrapId: Both existing implementations preserve an /@id/ prefix or prepend it and replace a null byte with __x00__. The runtime's local constants equal the node constants. Both copies are deleted and callers import the new shared helper; unwrapId/slash/cleanUrl are also consolidated in this same event. The shared module is new, so this is extraction, not an unchanged existing-callee body replacement. Count this commit once, not once per utility. |
| vite-shared-ssr-guards | vite / `93be84eccde7` | extract/extend | proxyGuardOnlyEsm / proxyGuardOnlyEsm: Both before functions conditionally return the module or a Proxy rejecting invalid named exports while allowing then. Both definitions are removed and callers import one shared implementation. The same commit also adapts analyzeImportedModDifference's inputs, so the whole commit is ONE extraction family, not several direct-reuse examples; shared/ssrTransform.ts did not exist before. |
| vite:306e250a94e12584b4182db8ec531750b3d9e3ba | vite / `306e250a94e1` | related-different | stringifyModuleExportName reads an export-name AST node and returns a string; EvaluatedModules.invalidateModule returns void, clears evaluation/meta/map/promise/exports state, and clears node.imports. These are incompatible return and state contracts despite both naming their argument node. |
| vue-public-instance-fragment-unknown | vue / `9daf90e29fec` | unknown | getPublicInstance / getExposeProxy: The author replaces repeated getExposeProxy(instance)\|\|instance.proxy expressions with an extended/renamed helper. This is real expression-level reuse, but the two before functions are not duplicate bodies: getPublicInstance handles null and functional-parent traversal, while getExposeProxy builds an exposed Proxy. Withhold the whole-symbol pair from positive supervision rather than inflate TS family yield with a fragment-level refactor. |
| vue:87c54430448005294c41803f07f517fef848f917 | vue / `87c544304480` | related-different | getConstantType computes a ConstantTypes enum, caches results and may remove block helpers. transformText instead returns a deferred visitor that merges text children, splices arrays and generates CREATE_TEXT calls; it even calls getConstantType as a subordinate query. These compiler phases cannot replace one another. |

Direct reuse is not inferred from a commit subject or shortened body: it requires an existing target with unchanged source hash/identity, an explicit after-caller witness, and review of argument, return, validation and effect compatibility. A new shared module is extraction, even if its copied body is identical. Unknown denotes withheld supervision, not a negative. The Vue expression-only extraction is withheld because it does not prove whole-function interchangeability; the Pydantic move is withheld because two similar functions move separately instead of merging.

## Matching permissive-detector negatives and missing support

| Repo | Normal commits replayed | Unavailable | Duplicate candidates | Reviewed related-different pairs | Both positive and negative families? |
| --- | ---: | ---: | ---: | ---: | --- |
| zod | 12 | 0 | 52 | 10 | **no** |
| pydantic | 12 | 0 | 17 | 5 | **no** |
| django | 4 | 3 | 2 | 2 | yes |
| scikit-learn | 4 | 0 | 4 | 1 | yes |
| typescript-eslint | 12 | 0 | 43 | 15 | **no** |
| typescript | 2 | 2 | 0 | 0 | **no** |
| vite | 2 | 0 | 15 | 1 | yes |
| vue | 2 | 0 | 3 | 1 | **no** |
| pandas | 2 | 1 | 0 | 0 | **no** |

New normal samples use the two smallest SHA-256(normal-v1:commit) eligible non-keyword production-changing commits, independently of findings. Original sampling and unavailable runs are preserved. Unavailable is never a clean negative, and unreviewed candidates are never labelled automatically. Both-sides support per repo is **also incomplete**, as shown above; this is a stopped search, not a training-ready corpus.

## Family-balanced separation by action class

Each cell is **family-balanced AUC (observed target/reference pairs)**. Each family has unit weight among available values. Ties count half; missing unions/shapes/usage ratios are omitted and coverage is shown. Higher similarity is oriented positive; ↓ inverts mismatch/opposition. No direction or cutoff was fitted. Contract comparison excludes current related/ancestor and incompatible-kind pairs; current default signal comparison includes all labelled pairs. Unknown is shown descriptively only and is not training truth. No direct positives means undefined direct AUC, not 0.5 or 1.

### Proposed contracts

| Feature | Direct reuse vs related-different | Extract/extend vs related-different | Unknown vs related-different |
| --- | ---: | ---: | ---: |
| reads | — (0/26) | 0.934 (28/26) | 0.627 (2/26) |
| writes | — (0/7) | 0.893 (2/7) | 0.643 (2/7) |
| calls | — (0/27) | 0.958 (28/27) | 0.635 (2/27) |
| returnShape | — (0/22) | 0.880 (23/22) | 0.381 (1/22) |
| arity | — (0/27) | 0.722 (28/27) | 0.722 (2/27) |
| parameterUse | — (0/21) | 0.730 (27/21) | 0.723 (2/21) |
| exceptions | — (0/2) | 0.750 (2/2) | 1.000 (1/2) |
| validation | — (0/13) | 0.823 (24/13) | 0.958 (2/13) |
| earlyReturns | — (0/12) | 0.955 (23/12) | 0.818 (1/12) |
| sameFile | — (0/27) | 0.715 (28/27) | 0.590 (2/27) |
| verbOpposition ↓ | — (0/27) | 0.528 (28/27) | 0.528 (2/27) |
| writePresenceMismatch ↓ | — (0/27) | 0.653 (28/27) | 0.403 (2/27) |
| literals | — (0/23) | 0.784 (26/23) | 1.000 (1/23) |

### Frozen current default signals

| Feature | Direct reuse vs related-different | Extract/extend vs related-different | Unknown vs related-different |
| --- | ---: | ---: | ---: |
| structure | — (0/35) | 0.938 (28/35) | 0.564 (2/35) |
| exact | — (0/35) | 0.795 (28/35) | 0.476 (2/35) |
| vocabulary | — (0/35) | 0.822 (28/35) | 0.476 (2/35) |
| bindingExact | — (0/35) | 0.750 (28/35) | 0.500 (2/35) |
| structureVocabulary | — (0/35) | 0.912 (28/35) | 0.560 (2/35) |
| exactVocabulary | — (0/35) | 0.791 (28/35) | 0.476 (2/35) |
| paramCount | — (0/35) | 0.774 (28/35) | 0.774 (2/35) |
| paramNames | — (0/35) | 0.733 (28/35) | 0.428 (2/35) |
| returnType | — (0/35) | 0.537 (28/35) | 0.412 (2/35) |
| name | — (0/35) | 0.968 (28/35) | 0.924 (2/35) |

**Direct-reuse versus related-different does not have enough reviewed support to establish a precision-first BLOCK rule.** AUC is not precision, and selected case-control prevalence cannot estimate deployment precision. Extract/extend is a different action and must not supply missing direct-reuse positives. Writes/exceptions have sparse support, same-file/repository/language are confounded, and unknown syntactic effects remain unknown. No threshold search or new BLOCK policy was performed. Held-out precision/recall remain unmeasured; got/click/pytest were neither replayed nor edited.

See [method.md](method.md) for reproduction and the original causal diagnosis. Recommended next decision: change the positive-collection strategy or source mix, not relax the direct-reuse label or fit a rule to these examples.

# Checking beyond the repository

`gw verify`, `gw check`, the `verify_calls` MCP tool and the edit hook also check calls that leave the repository: installed dependencies, sibling workspace packages and local service contracts. Everything is read from files already on disk. Nothing is downloaded, and no package manager, compiler or interpreter is run.

```
src/app.ts:4 unknown-export: lodash has no `deepMerge`; installed version has `merge` (v4.17).
svc/main.go:8 arity: uuid.Parse takes 1 argument, got 2 (github.com/google/uuid v1.6: func Parse(s string) (UUID, error)).
packages/web/src/page.ts:1 unknown-export: @acme/core has no `formatCurrency`; it has `formatMoney` (workspace package).
src/client.ts:6 contract: `/users/{id}` has no DELETE in api/openapi.yaml; it allows GET.
```

## What is read

| Ecosystem | Source of truth | Version comes from |
| --- | --- | --- |
| npm | `node_modules/**/*.d.ts` (the package's own types, or `@types/*`), `node:` built-ins from `@types/node` | the installed `package.json` |
| PyPI | `.pyi` stubs or `.py` source in the project's virtualenv (`.venv`, `venv`, `VIRTUAL_ENV`, `deps.pythonPaths`) | `*.dist-info` |
| Go | `vendor/`, the module cache, `GOROOT` for the standard library | `go.mod`, including `replace` |
| Maven / Gradle | class files inside JARs in `~/.m2` and the Gradle cache | `pom.xml`, `build.gradle(.kts)` |
| Cargo | crate source in `vendor/` or `~/.cargo/registry` | `Cargo.lock` |

Workspace siblings resolve to their source: npm, pnpm and Yarn workspaces, `go.work` and local `replace`, Cargo workspace members and Maven modules.

Contracts are OpenAPI (`openapi`/`swagger` JSON or YAML), GraphQL schemas (`.graphql`, `.gql`) and protobuf services (`.proto`) found in the repository.

## What blocks and what warns

A package surface is either **closed** (every export could be listed) or **open** (types missing, a dynamic `__getattr__`, a star re-export that could not be followed, a binary-only module). Open surfaces are never checked.

| Finding | When | Blocks |
| --- | --- | --- |
| `unknown-export`, `unknown-member` | the name is absent from a closed surface | yes |
| `arity` | every overload rejects the argument count; spreads are skipped | yes |
| `unresolved-import` | a Go import path is absent from a module that is present | yes |
| `deprecated` | the symbol is marked deprecated in the installed version | no |
| `contract` | an HTTP path or method, GraphQL root field or protobuf rpc is not in the local contract | no |
| Cargo | the imported name never appears in the crate source | no |

Suggestions are real names from the same surface, with the installed version.

## Cache and commands

Surfaces are cached per ecosystem, package and version under `.groundwork/deps/`; workspace packages are always re-read.

| Command | What it does |
| --- | --- |
| `gw deps` | Show workspaces, contracts and cache state. |
| `gw deps build` | Read every installed package once so later checks are warm. |
| `gw deps show <module> [--from <file>]` | Print what Groundwork knows about a package, and whether it is checked. |

Config (`.groundwork/config.json`): `deps.enabled`, `deps.cache`, `deps.contracts`, `deps.pythonPaths`.

## Measured

The preregistered gate is in [bench/deps](../bench/deps/PREREGISTRATION-v2.md): 69 seeded mistakes across npm, PyPI, Go and Maven, each confirmed as a real error by the ecosystem's own toolchain.

| Run | Recall | False blocks | Cold index | Network calls | Gate |
| --- | --- | --- | --- | --- | --- |
| [v1](../bench/deps/results/RESULTS.md) | 49/69 (71%) | 0 in 7,798 | 3.0 s for 1,048 packages | 0 | fail |
| [v2](../bench/deps/results-v2/RESULTS.md) | 61/69 (88.4%) | 0 in 7,857 | 3.0 s for 1,048 packages | 0 | pass |
| [v2 rerun](../bench/deps/results-v2-rerun/RESULTS.md) | 61/69 (88.4%) | 0 in 8,219 | 3.0 s for 1,048 packages | 0 | pass |

v1 failed because the harness copied the Python control corpus into the case project, where it shadowed the installed packages; v2 changes only that and is disclosed in its preregistration. All results stay published. The rerun repeats the v2 protocol after code-review fixes to the checker; it misses the same eight cases.

## Limits

- PyPI recall is the weakest (12 of 18 in v2): names re-exported from submodules and module-level arity are often missed.
- 656 of the 1,048 timed packages were left open and are not checked at all.
- Rust is warnings-only and is not in the seeded set.
- Contract checks see literal paths and common client shapes only, and never block.
- The cases are seeded, not collected from agent sessions; the gate says nothing about how often agents make these mistakes, or about time, tokens or cost.

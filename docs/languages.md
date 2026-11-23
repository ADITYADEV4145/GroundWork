# Languages

`gw doctor` lists the languages found in your index and the type backend used for each. This page says what Groundwork checks per language.

| Language | Files | Index, navigation, impact | Duplicate gate | Invented-call checks (grounding) | Type backend |
| --- | --- | --- | --- | --- | --- |
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts`, `.d.ts` | yes | yes | yes | TypeScript compiler (bundled) |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | yes | yes | yes | none |
| Python | `.py`, `.pyi` | yes | yes | yes | pyright, if installed |
| Go | `.go` | yes | yes | no | none |
| Rust | `.rs` | yes | yes | no | none |
| Java | `.java` | yes | yes | no | none |
| C# | `.cs` | yes | yes | no | none |
| Ruby | `.rb`, `.rake` | yes | yes | no | none |

Files in other languages are not indexed; the agent uses its normal tools for them.

## TypeScript

Groundwork uses the TypeScript compiler it ships with and reads your `tsconfig.json`. `gw doctor` shows the compiler version and whether a root `tsconfig.json` was found; without one, compiler defaults apply and path aliases will not resolve. Type errors on changed lines are reported, and only errors that were not already in the base commit can block. Turn it off with `{"types": {"typescript": "off"}}` in `.groundwork/config.json`.

## JavaScript

JavaScript, JSX and CommonJS files are indexed and checked for duplicates and invented imports, calls and members. There is no type backend for plain JavaScript.

## Python

Indexing, duplicates and invented-call checks work without extra tools. Type checks need pyright: Groundwork uses `node_modules/.bin/pyright` in the repository if present, otherwise `pyright` on `PATH` (`npm i -g pyright` or `pip install pyright`). Without it, `gw doctor` warns and Python type checks are skipped; nothing else changes. Turn it off with `{"types": {"python": "off"}}`.

## Go, Rust, Java, C#, Ruby

These are indexed with tree-sitter, so symbol search, callers and callees, change impact and the duplicate gate work. Invented-call checks and type checks do not run for them; rely on the language's own compiler or test run for those errors.

## When a language looks wrong

- `gw doctor` shows `languages` empty: the index is not built. Run `gw init`.
- A language you expect is missing: its files are ignored (`.gitignore`) or excluded in `.groundwork/config.json`. `gw stats` shows what was indexed.
- `grammar:<language>` fails in `gw doctor`: the install is incomplete. Reinstall Groundwork.

# Reuse First

Groundwork stops two kinds of duplication: writing code that already exists under a new name, and adding new code next to old code instead of changing the old code.

## Before writing: `find_similar`

```json
find_similar({
  "description": "format a Date as YYYY-MM-DD for the UI",
  "name": "formatDay",
  "signature": "formatDay(d: Date): string",
  "language": "typescript"
})
```

```
reuse as-is: formatDate (src/utils/date.ts:4) — same structure and vocabulary; formats a Date as an ISO day
extend: formatDateTime (src/utils/date.ts:18) — similar purpose; add an option instead of a sibling
State REUSE <symbol> / EXTEND <symbol> / NEW because <reason>.
```

Then answer in one line:

- `REUSE formatDate`: import it and call it.
- `EXTEND formatDateTime`: add a `{ time: false }` option rather than writing `formatDay`.
- `NEW because no existing helper parses RFC 5545 durations`: the reason says what is missing.

`find_similar` combines three signals: structure (MinHash over normalised tokens, which catches copy-paste and renamed clones), vocabulary (TF-IDF over identifier words and docs, which catches same-purpose code) and a calibrated probability. Pass `code` once you have a draft for a sharper match.

## After writing: `gw check` and the Stop gate

`gw check` compares the work tree with `HEAD`, or with the commit you give as `--base <ref>` for a PR. It reports:

| Finding | Meaning | Usual fix |
| --- | --- | --- |
| `duplicate` | a new or changed symbol matches an existing one | reuse or extend the existing symbol, then delete the new one |
| `dead-after-change` | you added a replacement and left the old version unused | move callers to one version and delete the other |
| `duplicate-constant` | a new literal (URL, path, env var, config key) duplicates an exported constant | import the existing constant |
| `duplicate-file` | most of a new file duplicates an existing file | reuse that file's exports |
| `grounding` | a changed line calls or imports something that does not exist | see [grounding](grounding.md) |
| `invalid-allow` | an allow comment's reason is too vague | write a specific reason |

`BLOCK` findings make `gw check` exit 1. They are reported only when the calibrated probability meets the threshold that gives at least 95% precision on the labelled set. `WARN` covers the medium band. Lower scores are not reported.

The Stop hook runs the same check within a 1.5 s budget and fails open:

- `standard` profile: findings are shown when you stop, but nothing is held back.
- `strict` profile: the first stop with a new set of BLOCK findings is held back, with the findings as the reason. The same set never blocks twice in one session.

## Intended duplicates

When a near-copy is deliberate (a vendored shim, a performance-specialised variant), say why on the line above it:

```ts
// groundwork: allow-duplicate keeps the Node 18 polyfill separate from the browser build
export function formatDateLegacy(d: Date): string { ... }
```

Valid allows are logged to `.groundwork/logs/allows.jsonl`. Reasons with fewer than three meaningful words are reported as `invalid-allow`.

## Configuration

```json
{ "profile": "standard", "reuse": { "duplicateGate": true, "skipTests": true } }
```

`duplicateGate: false` turns off the Stop gate. `skipTests` leaves test files out of the candidates.

# Natural-language search — frozen v2 results

Deterministic retrieval only, not an agent evaluation. No speed, token or cost claims.

| Arm | Set | N | Recall@1 | Recall@5 | MRR |
| --- | --- | ---: | ---: | ---: | ---: |
| baseline | paraphrase | 40 | 2.5% | 10.0% | 0.0746 |
| baseline | exact | 10 | 100.0% | 100.0% | 1.0000 |
| lexical | paraphrase | 40 | 17.5% | 35.0% | 0.2647 |
| lexical | exact | 10 | 100.0% | 100.0% | 1.0000 |
| hybrid | paraphrase | 40 | 22.5% | 57.5% | 0.3648 |
| hybrid | exact | 10 | 100.0% | 100.0% | 1.0000 |

**Gate: PASS.** Paraphrase Recall@5 gain: 25.0 points (required ≥15). Exact controls no drop: PASS.

Embeddings: RUN. 

Corpus anchor: 1d8e318723cc4be31c175913225137e1abb11fab. Manifest SHA256: 7b7c8e7f9a0b322ff7aa4ace9f851e526ec5939c1089d52e3427a194b8b4e293.
All 50 target IDs validated. One full evaluation, no post-result tuning.
MRR retrieval horizon: search API returns at most 100 hits; baseline uses its full result list.
Full returned ID lists and per-task ranks are retained in results.json.
Limitations: small author-written corpus; behavior paraphrases are not an independent user sample.
V1 remains FAIL. V2 ranking used v1 failures, not v2 outcomes. PREREGISTRATION-v2-main.md supersedes the unrun old-main anchor without query changes.

## Post-run corrections

The table above measured commit `b8c3935`'s ranking. It is preserved as the
historical v2 result, not a measurement of subsequent fixes. Synonym expansion
now stems once rather than re-stemming normalized terms: `settings` previously
became `setting` then `set`, losing configuration synonyms. This changes ranking
for settings-like double stems. By inspection only, task `v2-p37` contains
`settings` ("fill missing settings from a named preset without overriding explicit values").
The correction is not re-measured; no v2 evaluation was repeated and the frozen
tasks and raw results remain unchanged.

The runner now refuses existing results directories before evaluation; an
intentional independent rerun must select `--out <new directory>`. This protects
the published results from overwrite or accidental loss of the hybrid arm.
This harness correction is not re-measured on v2.

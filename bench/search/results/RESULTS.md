# Natural-language search — frozen v1 results

Deterministic retrieval only, not an agent evaluation. No speed, token or cost claims.

| Arm | Set | N | Recall@1 | Recall@5 | MRR |
| --- | --- | ---: | ---: | ---: | ---: |
| baseline | paraphrase | 40 | 7.5% | 22.5% | 0.1493 |
| baseline | exact | 10 | 100.0% | 100.0% | 1.0000 |
| lexical | paraphrase | 40 | 15.0% | 35.0% | 0.2579 |
| lexical | exact | 10 | 100.0% | 100.0% | 1.0000 |
| hybrid | paraphrase | 40 | 30.0% | 50.0% | 0.3878 |
| hybrid | exact | 10 | 100.0% | 100.0% | 1.0000 |

**Gate: FAIL.** Paraphrase Recall@5 gain: 12.5 points (required ≥15). Exact controls no drop: PASS.

Embeddings: RUN. 

Corpus anchor: 10fc7493ed024d817b5cabf7cbf4aaa97533825c. Manifest SHA256: b692809e064e38238daaf5b05e81e403460a38592bb249d3004ef023426fd24b.
All 50 target IDs validated. One full evaluation, no post-result tuning.
MRR retrieval horizon: search API returns at most 100 hits; baseline uses its full result list.
Full returned ID lists and per-task ranks are retained in results.json.
Limitations: small author-written corpus; behavior paraphrases are not an independent user sample.

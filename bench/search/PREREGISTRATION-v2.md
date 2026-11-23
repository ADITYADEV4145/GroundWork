# Natural-language search deterministic gate — preregistration v2

V1 remains published as FAIL: lexical paraphrase Recall@5 improved 12.5 points,
short of 15. V2 ranking development uses v1 failures; v1 is no longer held-out.
This fresh manifest is committed before implementing or evaluating v2 ranking.
No query/threshold changes or further iteration after the single v2 evaluation.
This is deterministic retrieval, not agent success; no speed/token/cost claims.

## Frozen corpus and held-out tasks

- Current origin/main anchor: `10fc7493ed024d817b5cabf7cbf4aaa97533825c`.
- Independently index only its `src/` and existing `fixtures/py-app/app/`.
- Forty new behavioral paraphrases and ten exact controls, all using targets
  different from v1. Avoid target name words; do not copy docstrings.
- Manifest: `bench/search/tasks-v2.json`; SHA256:
  `52cbe453e379e01825a91d293364a722a54698c43eb7bfa9e9cef9051b76bc45`.
- Validate every expected indexed ID before scoring. Any missing target is an
  evaluation error, never an excluded task. A validation-only pass is not scoring.

## Arms, metrics and gate

- Baseline: unchanged current `findCode` (find_code).
- Lexical: default no-model searchCode ranking with semantic explicitly disabled.
- Hybrid: searchCode plus local embeddings. Runtime never downloads. Optional
  setup requires explicit runner `--embeddings` consent; otherwise use installed
  models or record NOT RUN with the actual reason. Hybrid does not decide the gate.
- Recall@1/5: fraction whose first 1/5 hits include any frozen expected ID.
  MRR: reciprocal first correct rank, misses zero; report by paraphrase/exact set.
  All returned hits count, search API horizon 100, baseline full list as in v1.
- PASS iff lexical paraphrase Recall@5 exceeds baseline by >=0.15 absolute AND
  exact-control Recall@1, Recall@5 and MRR do not drop. Otherwise publish FAIL.
- Runner: `node --import tsx bench/search/run.ts --v2 [--embeddings]`.
  Verify manifest SHA and anchor reachability, extract pinned corpora with git
  archive, retain raw ID lists/ranks in `results-v2/results.json` and publish the
  full table and verdict in `results-v2/RESULTS.md` after one complete evaluation.
- A tiny synthetic fixture harness test is not this held-out evaluation.
- Limitations: author-selected tasks in a small familiar corpus; this is not
  independent user evidence. No tuning on v2 results or task amendments allowed.

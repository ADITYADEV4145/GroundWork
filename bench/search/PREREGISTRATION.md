# Natural-language search deterministic gate — preregistration v1

This protocol and frozen tasks precede ranking implementation and evaluation.
This is a tool-level retrieval evaluation, not an agent-success evaluation.
Publish PASS or FAIL either way; no speed, token or cost claims.

## Frozen corpus and tasks

- Anchor: `10fc7493ed024d817b5cabf7cbf4aaa97533825c` (current main).
- GroundWork corpus: only `src/` at the anchor; Python corpus: the existing
  `fixtures/py-app/` at the same anchor, excluding expected.json and tests.
- Manifest: `bench/search/tasks.json`; SHA256:
  `b692809e064e38238daaf5b05e81e403460a38592bb249d3004ef023426fd24b`.
- Forty behavioral paraphrases avoiding target identifier words, plus ten
  exact-name controls. Expected indexed IDs and human-readable targets are frozen.
  No task removal, query changes or threshold tuning after this commit.
- Index each corpus independently with default settings; validate every expected
  target before scoring. Missing targets are evaluation errors, not dropped tasks.

## Arms and metrics

- Baseline: existing `findCode` / MCP find_code, unchanged.
- Lexical: `searchCode` with default lexical configuration, semantic disabled.
- Hybrid: same search with installed local embeddings. Run only if installation
  succeeds in this environment via explicit `gw init --embeddings`; otherwise
  record NOT RUN and the actual reason. Runtime must never download.
- Recall@1, Recall@5: fraction of tasks with any expected ID in the first 1 or 5.
  MRR: mean reciprocal first expected-ID rank across all returned hits, misses 0.
  Report separately for paraphrases and exact controls. All tasks equally weighted.
- Pass: lexical Recall@5 minus baseline Recall@5 >= 0.15 absolute on paraphrases
  AND no drop in Recall@1, Recall@5 or MRR on exact controls.
  Optional hybrid does not determine this lexical gate.
- Run the full frozen benchmark once after implementation. Preserve raw ranks,
  outputs and real metrics in results/results.json and results/RESULTS.md.
  Runner validates manifest SHA and extracts the pinned corpus with git archive.
  A tiny-subset harness smoke test does not count as the full evaluation.
- Any later protocol change requires a new versioned preregistration and disclosure;
  never overwrite tasks or thresholds to turn a failed result into a pass.

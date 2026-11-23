# V2 corpus-anchor amendment — before any v2 ranking or scoring

Supersedes the corpus anchor and manifest in PREREGISTRATION-v2.md only.
All metrics, arms, thresholds, single-evaluation and no-tuning rules remain.
V1 remains FAIL, untouched; its failures inform v2 ranking development.

During work, origin/main advanced to `1d8e318723cc4be31c175913225137e1abb11fab`
(type-aware checks). The request to merge and use that current-main anchor
arrived after commit 9a74214 froze v2 at the previous main. No v2 ranking code
or v2 scoring had been written/run. The main merge preserves both features.

Rather than edit a frozen file, this versioned amendment pins the new current
main and preserves exactly the same 40 new paraphrase queries, ten exact
controls, targets and expected IDs in `tasks-v2-main.json`. Nothing was selected
or amended using v2 retrieval outcomes. Index only src/ and separately the
existing fixtures/py-app/app/ at that anchor. The runner --v2 now selects this
superseding manifest and writes results-v2/; prior frozen files remain intact.

- Manifest SHA256: `7b7c8e7f9a0b322ff7aa4ace9f851e526ec5939c1089d52e3427a194b8b4e293`.
- PASS iff lexical paraphrase Recall@5 minus unchanged find_code >=0.15 and
  there is no exact-control drop in Recall@1, Recall@5 or MRR.
- Hybrid optional: only installed models unless `--embeddings` explicitly
  consents to setup downloads. Never download during runtime search.
- Publish the single complete result PASS or FAIL without further iteration.

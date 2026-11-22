# Search retrieval benchmarks

Run `node --import tsx bench/search/run.ts` for the frozen v1 protocol.
Without flags, the optional semantic arm uses only already-installed models;
otherwise it is recorded NOT RUN. Explicit `--embeddings` permits benchmark
setup to download missing models, equivalent to consenting to `gw init --embeddings`.
Runtime search never downloads. Workspaces are persistent and never reused.

Run held-out v2 with `node --import tsx bench/search/run.ts --v2`. It uses
`PREREGISTRATION-v2-main.md` and `tasks-v2-main.json`, a disclosed pre-evaluation
anchor amendment after main advanced; the original unrun v2 files are preserved.
Use `--v2 --embeddings` only when explicitly consenting to setup downloads.

The published v1 results and original preregistration remain unchanged. The
original runner installed models unconditionally; the current runner corrects
that consent defect without changing those historical results.

# Search retrieval benchmarks

Run `node --import tsx bench/search/run.ts` for the frozen v1 protocol.
Without flags, the optional semantic arm uses only already-installed models;
otherwise it is recorded NOT RUN. Explicit `--embeddings` permits benchmark
setup to download missing models, equivalent to consenting to `gw init --embeddings`.
Runtime search never downloads. Workspaces are persistent and never reused.

The published v1 results and original preregistration remain unchanged. The
original runner installed models unconditionally; the current runner corrects
that consent defect without changing those historical results.

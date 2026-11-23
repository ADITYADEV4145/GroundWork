# Tokens per lookup

How many tokens GroundWork's tool output costs for a code lookup, against what grep-and-read costs for the same query on the same files. The repositories, commits, queries and the grep-top-3 baseline follow the public method of the jcodemunch-mcp token-efficiency benchmark, so the baseline is defined the same way as theirs. jcodemunch itself is not run here and none of its code is used.

**This measures retrieval token cost only.** It does not measure whether the returned symbols answer the query, whether an agent finishes a task, or speed. A tool can score well here by returning small or irrelevant symbols, so RESULTS.md lists every fetched symbol and counts how many sit in test, example, docs, benchmark or script paths and how many are three lines or fewer.

## Corpus

Three repositories at fixed commits (`tasks.json`): expressjs/express, fastapi/fastapi, gin-gonic/gin, five queries each, 15 lookups. The corpus for both sides is every file GroundWork indexes at that commit with the default configuration. The runner refuses a checkout whose HEAD or tracked files differ from the pinned commit.

## The two sides

**Grep-top-3 (baseline).** Find every file with a line containing any query term, case-insensitive. Cost = the list of matching paths, one per line, plus the three files with the most matching lines read whole (ties broken by path). Ranking by match count and listing paths only both favour the baseline. An agent that reads line ranges pays less than this; that is not modelled.

**Read-all.** Every indexed file concatenated. Reported for completeness; no agent pays it.

**GroundWork.** `search_code(query, limit 5)`, then `read_symbol` on each of the top three results. `read_symbol` pages long bodies, so the runner follows every `Next:` call and counts all pages: whole bodies are counted, as on the baseline side whole files are. The counted text is exactly what the MCP tool handlers return. Embeddings are not installed, so search is lexical only.

Tokens are counted with `cl100k_base` (the `gpt-tokenizer` package). Both sides are measured in the same run; nothing is a stored constant.

## Reading the result

- The headline is the mean reduction per lookup against grep-top-3. Pooled totals weigh the largest baselines most and are reported beside it.
- jcodemunch publishes 96.3% for its own tool by this method. That figure was produced by their harness over the files their indexer selects, which differ from ours (they report 186 express files, GroundWork indexes 152), so the two numbers are close in method but are not a head-to-head. A head-to-head needs both tools run by one harness over one file list.
- The tool schema and instruction tokens an agent pays once per session are not counted on either side.
- One run, deterministic: a second run reproduces every token count.

## Run

```
npm run bench:lookup-tokens -- --setup --out <new directory>
```

`--setup` clones the pinned commits into `~/work/gw-lookup-repos` (override with `GW_LOOKUP_REPOS_CACHE`, which must be outside this repository). The runner writes `.groundwork/` inside each checkout and refuses to overwrite an existing results directory. Published results are in `results/`.

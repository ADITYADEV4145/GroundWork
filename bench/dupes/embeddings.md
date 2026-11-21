# Optional local meaning calibration

| Model (q8) | Size MiB | Embed ms/symbol | BLOCK | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Xenova/all-MiniLM-L6-v2 | 22.6 | 10.80 | 0.752612685 | 95.1% | 56.4% |
| Xenova/bge-small-en-v1.5 | 33.1 | 17.19 | 0.751106690 | 95.2% | 57.6% |
| Xenova/jina-embeddings-v2-small-en | 31.9 | 12.25 | 0.750835136 | 95.2% | 57.6% |

Selected **Xenova/jina-embeddings-v2-small-en**, ordered by BLOCK precision then recall, then smaller cache size.

### Xenova/all-MiniLM-L6-v2

| Type | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| 1 | 24 | 7 | 77.4% | 100.0% |
| 2 | 46 | 7 | 86.8% | 95.8% |
| 3 | 22 | 7 | 75.9% | 30.6% |
| 4 | 45 | 7 | 86.5% | 45.5% |

### Xenova/bge-small-en-v1.5

| Type | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| 1 | 24 | 7 | 77.4% | 100.0% |
| 2 | 46 | 7 | 86.8% | 95.8% |
| 3 | 22 | 7 | 75.9% | 30.6% |
| 4 | 48 | 7 | 87.3% | 48.5% |

### Xenova/jina-embeddings-v2-small-en

| Type | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| 1 | 24 | 7 | 77.4% | 100.0% |
| 2 | 46 | 7 | 86.8% | 95.8% |
| 3 | 22 | 7 | 75.9% | 30.6% |
| 4 | 48 | 7 | 87.3% | 48.5% |

## Protocol and limitations

The same 510 pairs, 12 task-family groups and five family-disjoint OOF folds as [the no-meaning calibration](report.md). Each fold fits IDF on training symbols only. Features are the unchanged ten baseline signals plus cosine similarity of normalized mean-pooled q8 source embeddings (512-token truncation). Corpus labels are unchanged. A pretrained model sees source text only, never labels; no embedding fine-tuning. BLOCK is the lowest OOF threshold reaching 95% precision. WARN is 60% of BLOCK, not a separate safety claim. Per-type precision uses the same selected negative pool for every type.

Inference timings include one local model load and cache writes, exclude the consented download, and use one CPU thread. Sizes include the downloaded ONNX weights, tokenizer and config. These are planted/agent-reviewed labels; candidate and threshold selection use these OOF results, not an independent production test. Jina small-en is a general text embedding model; no Xenova ONNX base-code repository was available.

Reproduce: `node --import tsx scripts/calibrate-embeddings.ts --consent-download`. Omit the flag for fully offline evaluation after installation (timings then reflect vector-cache hits, not inference). Model files and vector cache stay under `$GW_EMBEDDING_EVAL_CACHE/.groundwork` (default `~/work/gw-embedding-evaluation/.groundwork`).

## Process latency

Node v24.22.2, built `dist/cli/main.js`, same Git duplicate fixture as the Stop optimization (`reuse-dist-timing-after-pr3`), 35 fresh processes per row, nearest-rank percentiles. Process startup is included; ONNX model files are local throughout. Warm disk/compile caches; no samples discarded.

| Command / state | p50 ms | p95 ms |
| --- | ---: | ---: |
| Default check (no meaning) | 189.48 | 269.03 |
| Default Stop (no meaning; every sample blocked) | 181.20 | 254.00 |
| Meaning check, all symbol vectors cached | 181.29 | 377.98 |
| Meaning check, one changed symbol / vector miss per process | 459.00 | 873.30 |

The first enabled check with no symbol vectors cached took 614.24 ms (one observation, not a percentile). Each cache-miss sample adds a distinct comment inside the duplicate function, forcing refresh and an exact-content vector miss without changing its behavior. Every enabled sample was verified to contain a duplicate finding with the meaning signal; failures were not treated as fast successes. The optional path is not claimed to meet 300 ms. An earlier default sweep before lazy-isolating the optional adapter graph measured p95 347.61 ms; it is not the final result and its outliers were not removed.

Independent final built Stop non-quick gate: p50 202.14 ms / p95 272.82 ms over 35 fresh processes, every sample blocked. Raw final samples and the measurement scripts are retained locally in `/home/ubuntu/work/stop-followup-item2-lazy-default.json`, `/home/ubuntu/work/embedding-followup-timing.json` and `/home/ubuntu/work/embedding-followup-benchmark.mjs`.

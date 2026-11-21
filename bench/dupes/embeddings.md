# Optional local meaning calibration

The same independent-symbol, compatible-kind and majority-structure BLOCK policy and retained pre-policy confidence floor as [the default model](report.md) apply. Eligibility is saved per OOF prediction; filtered positives count as false negatives. Before the policy: the selected model had 140 TP/7 FP, 95.24% precision, 57.61% recall. After: 73 TP/3 FP, 96.05% precision, 30.04% recall (27.57 percentage points lost). MiniLM is now the pick by tied precision/recall then size; the default model id follows the calibrated selection. Timings below are **warm vector-cache reads**, not new inference measurements. No model download occurred.

| Model (q8) | Size MiB | Embed ms/symbol | BLOCK | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Xenova/all-MiniLM-L6-v2 | 22.6 | 0.06 | 0.750997828 | 96.1% | 30.0% |
| Xenova/bge-small-en-v1.5 | 33.1 | 0.04 | 0.751106690 | 96.1% | 30.0% |
| Xenova/jina-embeddings-v2-small-en | 31.9 | 0.06 | 0.755600722 | 96.1% | 30.0% |

Selected **Xenova/all-MiniLM-L6-v2**, ordered by BLOCK precision then recall, then smaller cache size.

### Xenova/all-MiniLM-L6-v2

| Type | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| 1 | 24 | 3 | 88.9% | 100.0% |
| 2 | 46 | 3 | 93.9% | 95.8% |
| 3 | 3 | 3 | 50.0% | 4.2% |
| 4 | 0 | 3 | 0.0% | 0.0% |

### Xenova/bge-small-en-v1.5

| Type | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| 1 | 24 | 3 | 88.9% | 100.0% |
| 2 | 46 | 3 | 93.9% | 95.8% |
| 3 | 3 | 3 | 50.0% | 4.2% |
| 4 | 0 | 3 | 0.0% | 0.0% |

### Xenova/jina-embeddings-v2-small-en

| Type | TP | FP | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| 1 | 24 | 3 | 88.9% | 100.0% |
| 2 | 46 | 3 | 93.9% | 95.8% |
| 3 | 3 | 3 | 50.0% | 4.2% |
| 4 | 0 | 3 | 0.0% | 0.0% |

## Protocol and limitations

The same 510 pairs, 12 task-family groups and five family-disjoint OOF folds as [the no-meaning calibration](report.md). Each fold fits IDF on training symbols only. Features are the unchanged ten baseline signals plus cosine similarity of normalized mean-pooled q8 source embeddings (512-token truncation). Corpus labels are unchanged. A pretrained model sees source text only, never labels; no embedding fine-tuning. BLOCK is the lowest OOF threshold reaching 95% precision. WARN is 60% of BLOCK, not a separate safety claim. Per-type precision uses the same selected negative pool for every type.

Inference timings include one local model load and cache writes, exclude the consented download, and use one CPU thread. Sizes include the downloaded ONNX weights, tokenizer and config. These are planted/agent-reviewed labels; candidate and threshold selection use these OOF results, not an independent production test. Jina small-en is a general text embedding model; no Xenova ONNX base-code repository was available.

Reproduce: `node --import tsx scripts/calibrate-embeddings.ts --consent-download`. Omit the flag for fully offline evaluation after installation (timings then reflect vector-cache hits, not inference). Model files and vector cache stay under `$GW_EMBEDDING_EVAL_CACHE/.groundwork` (default `~/work/gw-embedding-evaluation/.groundwork`).

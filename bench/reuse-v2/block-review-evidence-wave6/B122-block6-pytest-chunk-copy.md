# B122: block6-pytest-chunk-copy

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate`
Added: `src/standalone_wave6_chunk_copy.py:26 vendored_chunk_copy`
Existing: `src/_pytest/_py/path.py:1452 copychunked`
Probability: `0.9923798119772258`

The complete executable FunctionDef AST of vendored_chunk_copy equals the actual named match copychunked at src/_pytest/_py/path.py:1452, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include dest.open, fdest.close, fdest.write, fsrc.close, fsrc.read, src.open. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def vendored_chunk_copy(src, dest):
    chunksize = 524288  # half a meg of bytes
    fsrc = src.open("rb")
    try:
        fdest = dest.open("wb")
        try:
            while 1:
                buf = fsrc.read(chunksize)
                if not buf:
                    break
                fdest.write(buf)
        finally:
            fdest.close()
    finally:
        fsrc.close()
```

## Existing complete symbol (covered excerpts for file findings)

```python
def copychunked(src, dest):
    chunksize = 524288  # half a meg of bytes
    fsrc = src.open("rb")
    try:
        fdest = dest.open("wb")
        try:
            while 1:
                buf = fsrc.read(chunksize)
                if not buf:
                    break
                fdest.write(buf)
        finally:
            fdest.close()
    finally:
        fsrc.close()
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 0.9228007056797659
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

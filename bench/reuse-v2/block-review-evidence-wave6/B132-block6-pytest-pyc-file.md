# B132: block6-pytest-pyc-file

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate`
Added: `src/standalone_wave6_pyc_file.py:40 vendored_pyc_file`
Existing: `src/_pytest/assertion/rewrite.py:327 _write_pyc`
Probability: `0.994419224643617`

The complete executable FunctionDef AST of vendored_pyc_file equals the actual named match _write_pyc at src/_pytest/assertion/rewrite.py:327, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include _write_pyc_fp, open, os.getpid, os.replace, state.trace. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def vendored_pyc_file(
    state: AssertionState,
    co: types.CodeType,
    source_stat: os.stat_result,
    pyc: Path,
) -> bool:
    proc_pyc = f"{pyc}.{os.getpid()}"
    try:
        with open(proc_pyc, "wb") as fp:
            _write_pyc_fp(fp, source_stat, co)
    except OSError as e:
        state.trace(f"error writing pyc file at {proc_pyc}: errno={e.errno}")
        return False

    try:
        os.replace(proc_pyc, pyc)
    except OSError as e:
        state.trace(f"error writing pyc file at {pyc}: {e}")
        # we ignore any failure to write the cache file
        # there are many reasons, permission-denied, pycache dir being a
        # file etc.
        return False
    return True
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _write_pyc(
    state: AssertionState,
    co: types.CodeType,
    source_stat: os.stat_result,
    pyc: Path,
) -> bool:
    proc_pyc = f"{pyc}.{os.getpid()}"
    try:
        with open(proc_pyc, "wb") as fp:
            _write_pyc_fp(fp, source_stat, co)
    except OSError as e:
        state.trace(f"error writing pyc file at {proc_pyc}: errno={e.errno}")
        return False

    try:
        os.replace(proc_pyc, pyc)
    except OSError as e:
        state.trace(f"error writing pyc file at {pyc}: {e}")
        # we ignore any failure to write the cache file
        # there are many reasons, permission-denied, pycache dir being a
        # file etc.
        return False
    return True
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 0.9652937016819582
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

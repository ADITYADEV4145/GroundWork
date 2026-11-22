# B10: block6-click-ansi-stream

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_ansi_stream.py:160 vendored_ansi_stream._safe_write`
Existing: `src/click/_compat.py:541 auto_wrap_for_ansi._safe_write`
Probability: `0.982638787530041`

The complete executable FunctionDef AST of vendored_ansi_stream._safe_write equals the actual named match auto_wrap_for_ansi._safe_write at src/click/_compat.py:541, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include _write, ansi_wrapper.reset_all. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def _safe_write(s: str) -> int:
        try:
            return _write(s)
        except BaseException:
            ansi_wrapper.reset_all()
            raise
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _safe_write(s: str) -> int:
            try:
                return _write(s)
            except BaseException:
                ansi_wrapper.reset_all()
                raise
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 1
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

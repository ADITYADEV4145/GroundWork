# B45: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:173 _is_binary_reader`
Existing: `src/click/_compat.py:151 _is_binary_reader`
Probability: `0.982638787530041`

The complete executable FunctionDef AST of _is_binary_reader equals the actual named match _is_binary_reader at src/click/_compat.py:151, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include isinstance, stream.read. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def _is_binary_reader(stream: t.IO[t.Any], default: bool = False) -> bool:
    try:
        return isinstance(stream.read(0), bytes)
    except Exception:
        return default
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _is_binary_reader(stream: t.IO[t.Any], default: bool = False) -> bool:
    try:
        return isinstance(stream.read(0), bytes)
    except Exception:
        return default
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

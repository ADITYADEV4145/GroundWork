# B137: block6-pytest-repr-exception

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate`
Added: `src/standalone_wave6_repr_exception.py:21 vendored_repr_exception`
Existing: `src/_pytest/_io/saferepr.py:16 _format_repr_exception`
Probability: `0.9894822512625472`

The complete executable FunctionDef AST of vendored_repr_exception equals the actual named match _format_repr_exception at src/_pytest/_io/saferepr.py:16, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include _try_repr_or_str, id, type. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def vendored_repr_exception(exc: BaseException, obj: object) -> str:
    try:
        exc_info = _try_repr_or_str(exc)
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException as inner_exc:
        exc_info = f"unpresentable exception ({_try_repr_or_str(inner_exc)})"
    return (
        f"<[{exc_info} raised in repr()] {type(obj).__name__} object at 0x{id(obj):x}>"
    )
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _format_repr_exception(exc: BaseException, obj: object) -> str:
    try:
        exc_info = _try_repr_or_str(exc)
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException as inner_exc:
        exc_info = f"unpresentable exception ({_try_repr_or_str(inner_exc)})"
    return (
        f"<[{exc_info} raised in repr()] {type(obj).__name__} object at 0x{id(obj):x}>"
    )
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 0.9275505842459079
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

# B82: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:970 _nullpager`
Existing: `src/click/_termui_impl.py:544 _nullpager`
Probability: `0.9841314380539381`

The complete executable FunctionDef AST of _nullpager equals the actual named match _nullpager at src/click/_termui_impl.py:544, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include stream.write, strip_ansi. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def _nullpager(
    stream: t.TextIO, generator: cabc.Iterable[str], color: bool | None
) -> None:
    """Simply print unformatted text.  This is the ultimate fallback."""
    for text in generator:
        if not color:
            text = strip_ansi(text)
        stream.write(text)
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _nullpager(
    stream: t.TextIO, generator: cabc.Iterable[str], color: bool | None
) -> None:
    """Simply print unformatted text.  This is the ultimate fallback."""
    for text in generator:
        if not color:
            text = strip_ansi(text)
        stream.write(text)
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

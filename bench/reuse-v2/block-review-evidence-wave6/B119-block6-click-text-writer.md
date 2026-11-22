# B119: block6-click-text-writer

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_text_writer.py:255 vendored_text_writer`
Existing: `src/click/_compat.py:300 _force_correct_text_writer`
Probability: `0.9957419992524318`

The complete executable FunctionDef AST of vendored_text_writer equals the actual named match _force_correct_text_writer at src/click/_compat.py:300, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include _force_correct_text_stream. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def vendored_text_writer(
    text_writer: t.IO[t.Any],
    encoding: str | None,
    errors: str | None,
    force_writable: bool = False,
) -> t.TextIO:
    return _force_correct_text_stream(
        text_writer,
        encoding,
        errors,
        _is_binary_writer,
        _find_binary_writer,
        force_writable=force_writable,
    )
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _force_correct_text_writer(
    text_writer: t.IO[t.Any],
    encoding: str | None,
    errors: str | None,
    force_writable: bool = False,
) -> t.TextIO:
    return _force_correct_text_stream(
        text_writer,
        encoding,
        errors,
        _is_binary_writer,
        _find_binary_writer,
        force_writable=force_writable,
    )
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 0.9511218513441899
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

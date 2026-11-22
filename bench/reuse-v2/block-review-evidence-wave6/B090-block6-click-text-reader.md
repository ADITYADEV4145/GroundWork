# B90: block6-click-text-reader

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_text_reader.py:34 is_ascii_encoding`
Existing: `src/click/_compat.py:40 is_ascii_encoding`
Probability: `0.982638787530041`

The complete executable FunctionDef AST of is_ascii_encoding equals the actual named match is_ascii_encoding at src/click/_compat.py:40, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include codecs.lookup. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def is_ascii_encoding(encoding: str) -> bool:
    """Checks if a given encoding is ascii."""
    try:
        return codecs.lookup(encoding).name == "ascii"
    except LookupError:
        return False
```

## Existing complete symbol (covered excerpts for file findings)

```python
def is_ascii_encoding(encoding: str) -> bool:
    """Checks if a given encoding is ascii."""
    try:
        return codecs.lookup(encoding).name == "ascii"
    except LookupError:
        return False
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

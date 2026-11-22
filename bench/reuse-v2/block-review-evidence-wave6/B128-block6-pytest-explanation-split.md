# B128: block6-pytest-explanation-split

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate`
Added: `src/standalone_wave6_explanation_split.py:9 vendored_explanation_split`
Existing: `src/_pytest/assertion/util.py:69 _split_explanation`
Probability: `0.9901753906252012`

The complete executable FunctionDef AST of vendored_explanation_split equals the actual named match _split_explanation at src/_pytest/assertion/util.py:69, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include (explanation or '').split, lines.append. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def vendored_explanation_split(explanation: str) -> list[str]:
    r"""Return a list of individual lines in the explanation.

    This will return a list of lines split on '\n{', '\n}' and '\n~'.
    Any other newlines will be escaped and appear in the line as the
    literal '\n' characters.
    """
    raw_lines = (explanation or "").split("\n")
    lines = [raw_lines[0]]
    for values in raw_lines[1:]:
        if values and values[0] in ["{", "}", "~", ">"]:
            lines.append(values)
        else:
            lines[-1] += "\\n" + values
    return lines
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _split_explanation(explanation: str) -> list[str]:
    r"""Return a list of individual lines in the explanation.

    This will return a list of lines split on '\n{', '\n}' and '\n~'.
    Any other newlines will be escaped and appear in the line as the
    literal '\n' characters.
    """
    raw_lines = (explanation or "").split("\n")
    lines = [raw_lines[0]]
    for values in raw_lines[1:]:
        if values and values[0] in ["{", "}", "~", ">"]:
            lines.append(values)
        else:
            lines[-1] += "\\n" + values
    return lines
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 0.9799350240734634
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

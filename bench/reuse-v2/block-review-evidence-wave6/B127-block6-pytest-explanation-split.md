# B127: block6-pytest-explanation-split

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_explanation_split.py:1 src/standalone_wave6_explanation_split.py`
Existing: `src/_pytest/assertion/util.py:1 src/_pytest/assertion/util.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/assertion/util.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_explanation_split -> _split_explanation. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Split assertion explanations without importing pytest."""

from __future__ import annotations


__all__ = ["vendored_explanation_split", "vendored_explanation_split_variant"]


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


def vendored_explanation_split_variant(explanation: str) -> tuple[str, ...]:
    """Return the split explanation lines as a tuple."""
    return tuple(vendored_explanation_split(explanation))
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/assertion/util.py:69-83
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
    "name": "symbolOverlap",
    "value": 1
  },
  {
    "name": "versionOrSameBasename",
    "value": 0
  }
]
```

Covered comparison pages: [B128](B128-block6-pytest-explanation-split.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

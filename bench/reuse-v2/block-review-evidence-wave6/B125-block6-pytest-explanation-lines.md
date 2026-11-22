# B125: block6-pytest-explanation-lines

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_explanation_lines.py:1 src/standalone_wave6_explanation_lines.py`
Existing: `src/_pytest/assertion/util.py:1 src/_pytest/assertion/util.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/assertion/util.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_explanation_lines -> _format_lines. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of the assertion explanation line formatter.

Vendored from ``_pytest.assertion.util._format_lines`` so that this module can
be imported by file path without importing pytest.
"""

from __future__ import annotations

from collections.abc import Sequence


__all__ = ["vendored_explanation_lines", "vendored_explanation_lines_variant"]


def vendored_explanation_lines(lines: Sequence[str]) -> list[str]:
    """Format the individual lines.

    This will replace the '{', '}' and '~' characters of our mini formatting
    language with the proper 'where ...', 'and ...' and ' + ...' text, taking
    care of indentation along the way.

    Return a list of formatted lines.
    """
    result = list(lines[:1])
    stack = [0]
    stackcnt = [0]
    for line in lines[1:]:
        if line.startswith("{"):
            if stackcnt[-1]:
                s = "and   "
            else:
                s = "where "
            stack.append(len(result))
            stackcnt[-1] += 1
            stackcnt.append(0)
            result.append(" +" + "  " * (len(stack) - 1) + s + line[1:])
        elif line.startswith("}"):
            stack.pop()
            stackcnt.pop()
            result[stack[-1]] += line[1:]
        else:
            assert line[0] in ["~", ">"]
            stack[-1] += 1
            indent = len(stack) if line.startswith("~") else len(stack) - 1
            result.append("  " * indent + line[1:])
    assert len(stack) == 1
    return result


def vendored_explanation_lines_variant(lines: Sequence[str]) -> list[str]:
    """Like :func:`vendored_explanation_lines`, with a newline appended to each line."""
    return [line + "\n" for line in vendored_explanation_lines(lines)]
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/assertion/util.py:86-118
def _format_lines(lines: Sequence[str]) -> list[str]:
    """Format the individual lines.

    This will replace the '{', '}' and '~' characters of our mini formatting
    language with the proper 'where ...', 'and ...' and ' + ...' text, taking
    care of indentation along the way.

    Return a list of formatted lines.
    """
    result = list(lines[:1])
    stack = [0]
    stackcnt = [0]
    for line in lines[1:]:
        if line.startswith("{"):
            if stackcnt[-1]:
                s = "and   "
            else:
                s = "where "
            stack.append(len(result))
            stackcnt[-1] += 1
            stackcnt.append(0)
            result.append(" +" + "  " * (len(stack) - 1) + s + line[1:])
        elif line.startswith("}"):
            stack.pop()
            stackcnt.pop()
            result[stack[-1]] += line[1:]
        else:
            assert line[0] in ["~", ">"]
            stack[-1] += 1
            indent = len(stack) if line.startswith("~") else len(stack) - 1
            result.append("  " * indent + line[1:])
    assert len(stack) == 1
    return result
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

Covered comparison pages: [B126](B126-block6-pytest-explanation-lines.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

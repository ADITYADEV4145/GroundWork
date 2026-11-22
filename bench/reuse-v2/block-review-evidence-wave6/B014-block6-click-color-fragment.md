# B14: block6-click-color-fragment

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate-file`
Added: `src/standalone_wave6_color_fragment.py:1 src/standalone_wave6_color_fragment.py`
Existing: `src/click/termui.py:1 src/click/termui.py`
Probability: `not supplied`

The added module is a partial file fork of src/click/termui.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_color_fragment -> _interpret_color. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone SGR color helpers vendored from Click's termui module."""

from __future__ import annotations

__all__ = ["vendored_color_fragment", "vendored_color_fragment_variant"]

_ansi_colors = {
    "black": 30,
    "red": 31,
    "green": 32,
    "yellow": 33,
    "blue": 34,
    "magenta": 35,
    "cyan": 36,
    "white": 37,
    "reset": 39,
    "bright_black": 90,
    "bright_red": 91,
    "bright_green": 92,
    "bright_yellow": 93,
    "bright_blue": 94,
    "bright_magenta": 95,
    "bright_cyan": 96,
    "bright_white": 97,
}


def vendored_color_fragment(
    color: int | tuple[int, int, int] | str, offset: int = 0
) -> str:
    if isinstance(color, int):
        return f"{38 + offset};5;{color:d}"

    if isinstance(color, (tuple, list)):
        r, g, b = color
        return f"{38 + offset};2;{r:d};{g:d};{b:d}"

    return str(_ansi_colors[color] + offset)


def vendored_color_fragment_variant(
    color: int | tuple[int, int, int] | str, offset: int = 0
) -> str:
    """Return a complete ANSI SGR escape sequence for the color."""
    return f"\033[{vendored_color_fragment(color, offset)}m"
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/click/termui.py:501-509
def _interpret_color(color: int | tuple[int, int, int] | str, offset: int = 0) -> str:
    if isinstance(color, int):
        return f"{38 + offset};5;{color:d}"

    if isinstance(color, (tuple, list)):
        r, g, b = color
        return f"{38 + offset};2;{r:d};{g:d};{b:d}"

    return str(_ansi_colors[color] + offset)
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

Covered comparison pages: [B15](B015-block6-click-color-fragment.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

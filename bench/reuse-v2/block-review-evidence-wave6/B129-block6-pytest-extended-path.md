# B129: block6-pytest-extended-path

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_extended_path.py:1 src/standalone_wave6_extended_path.py`
Existing: `src/_pytest/pathlib.py:1 src/_pytest/pathlib.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/pathlib.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_extended_path -> get_extended_length_path_str. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of ``_pytest.pathlib.get_extended_length_path_str``.

This module must stay importable by file path without loading ``_pytest``.
"""

from __future__ import annotations


__all__ = ["vendored_extended_path", "vendored_extended_path_variant"]


def vendored_extended_path(path: str) -> str:
    """Convert a path to a Windows extended length path."""
    long_path_prefix = "\\\\?\\"
    unc_long_path_prefix = "\\\\?\\UNC\\"
    if path.startswith((long_path_prefix, unc_long_path_prefix)):
        return path
    # UNC
    if path.startswith("\\\\"):
        return unc_long_path_prefix + path[2:]
    return long_path_prefix + path


def vendored_extended_path_variant(path: str) -> str:
    """Like :func:`vendored_extended_path`, but convert forward slashes to
    backslashes first."""
    return vendored_extended_path(path.replace("/", "\\"))
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/pathlib.py:150-159
def get_extended_length_path_str(path: str) -> str:
    """Convert a path to a Windows extended length path."""
    long_path_prefix = "\\\\?\\"
    unc_long_path_prefix = "\\\\?\\UNC\\"
    if path.startswith((long_path_prefix, unc_long_path_prefix)):
        return path
    # UNC
    if path.startswith("\\\\"):
        return unc_long_path_prefix + path[2:]
    return long_path_prefix + path
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

Covered comparison pages: [B130](B130-block6-pytest-extended-path.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

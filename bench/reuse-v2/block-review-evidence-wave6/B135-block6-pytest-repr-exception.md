# B135: block6-pytest-repr-exception

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_repr_exception.py:1 src/standalone_wave6_repr_exception.py`
Existing: `src/_pytest/_io/saferepr.py:1 src/_pytest/_io/saferepr.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/_io/saferepr.py, not merely a similar filename: 2 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include _try_repr_or_str -> _try_repr_or_str, vendored_repr_exception -> _format_repr_exception. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of ``_pytest._io.saferepr._format_repr_exception``.

This module is importable by file path without importing ``_pytest``.
"""

from __future__ import annotations


__all__ = ["vendored_repr_exception", "vendored_repr_exception_variant"]


def _try_repr_or_str(obj: object) -> str:
    try:
        return repr(obj)
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        return f'{type(obj).__name__}("{obj}")'


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


def vendored_repr_exception_variant(exc: BaseException, obj: object) -> str:
    """Like :func:`vendored_repr_exception`, with a trailing newline appended."""
    return vendored_repr_exception(exc, obj) + "\n"
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/_io/saferepr.py:7-13
def _try_repr_or_str(obj: object) -> str:
    try:
        return repr(obj)
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        return f'{type(obj).__name__}("{obj}")'

# src/_pytest/_io/saferepr.py:16-25
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
    "name": "symbolOverlap",
    "value": 1
  },
  {
    "name": "versionOrSameBasename",
    "value": 0
  }
]
```

Covered comparison pages: [B136](B136-block6-pytest-repr-exception.md), [B137](B137-block6-pytest-repr-exception.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

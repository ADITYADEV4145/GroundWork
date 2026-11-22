# B121: block6-pytest-chunk-copy

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_chunk_copy.py:1 src/standalone_wave6_chunk_copy.py`
Existing: `src/_pytest/_py/path.py:1 src/_pytest/_py/path.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/_py/path.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_chunk_copy -> copychunked. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
# mypy: allow-untyped-defs
"""Standalone vendored copy of ``copychunked`` from ``_pytest._py.path``.

This module has no dependency on ``_pytest`` so it can be imported directly
by file path without loading the pytest package.
"""

from __future__ import annotations

from typing import Any
from typing import IO
from typing import Protocol
from typing import TypeVar


__all__ = ["vendored_chunk_copy", "vendored_chunk_copy_variant"]


class _Openable(Protocol):
    def open(self, mode: str) -> IO[Any]: ...


_DestT = TypeVar("_DestT", bound=_Openable)


def vendored_chunk_copy(src, dest):
    chunksize = 524288  # half a meg of bytes
    fsrc = src.open("rb")
    try:
        fdest = dest.open("wb")
        try:
            while 1:
                buf = fsrc.read(chunksize)
                if not buf:
                    break
                fdest.write(buf)
        finally:
            fdest.close()
    finally:
        fsrc.close()


def vendored_chunk_copy_variant(src: _Openable, dest: _DestT) -> _DestT:
    """Like :func:`vendored_chunk_copy`, but return ``dest`` after copying."""
    vendored_chunk_copy(src, dest)
    return dest
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/_py/path.py:1452-1466
def copychunked(src, dest):
    chunksize = 524288  # half a meg of bytes
    fsrc = src.open("rb")
    try:
        fdest = dest.open("wb")
        try:
            while 1:
                buf = fsrc.read(chunksize)
                if not buf:
                    break
                fdest.write(buf)
        finally:
            fdest.close()
    finally:
        fsrc.close()
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

Covered comparison pages: [B122](B122-block6-pytest-chunk-copy.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

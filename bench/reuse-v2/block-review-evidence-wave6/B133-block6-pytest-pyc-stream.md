# B133: block6-pytest-pyc-stream

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_pyc_stream.py:1 src/standalone_wave6_pyc_stream.py`
Existing: `src/_pytest/assertion/rewrite.py:1 src/_pytest/assertion/rewrite.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/assertion/rewrite.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_pyc_stream -> _write_pyc_fp. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of the bytecode stream writer from _pytest.assertion.rewrite."""

from __future__ import annotations

import importlib.util
import marshal
import os
import struct
import types
from typing import IO


__all__ = ["vendored_pyc_stream", "vendored_pyc_stream_variant"]


def vendored_pyc_stream(
    fp: IO[bytes], source_stat: os.stat_result, co: types.CodeType
) -> None:
    # Technically, we don't have to have the same pyc format as
    # (C)Python, since these "pycs" should never be seen by builtin
    # import. However, there's little reason to deviate.
    fp.write(importlib.util.MAGIC_NUMBER)
    # https://www.python.org/dev/peps/pep-0552/
    flags = b"\x00\x00\x00\x00"
    fp.write(flags)
    # as of now, bytecode header expects 32-bit numbers for size and mtime (#4903)
    mtime = int(source_stat.st_mtime) & 0xFFFFFFFF
    size = source_stat.st_size & 0xFFFFFFFF
    # "<LL" stands for 2 unsigned longs, little-endian.
    fp.write(struct.pack("<LL", mtime, size))
    fp.write(marshal.dumps(co))


def vendored_pyc_stream_variant(
    fp: IO[bytes], source_stat: os.stat_result, co: types.CodeType
) -> None:
    """Write bytecode to the stream and flush it on success."""
    vendored_pyc_stream(fp, source_stat, co)
    fp.flush()
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/assertion/rewrite.py:309-324
def _write_pyc_fp(
    fp: IO[bytes], source_stat: os.stat_result, co: types.CodeType
) -> None:
    # Technically, we don't have to have the same pyc format as
    # (C)Python, since these "pycs" should never be seen by builtin
    # import. However, there's little reason to deviate.
    fp.write(importlib.util.MAGIC_NUMBER)
    # https://www.python.org/dev/peps/pep-0552/
    flags = b"\x00\x00\x00\x00"
    fp.write(flags)
    # as of now, bytecode header expects 32-bit numbers for size and mtime (#4903)
    mtime = int(source_stat.st_mtime) & 0xFFFFFFFF
    size = source_stat.st_size & 0xFFFFFFFF
    # "<LL" stands for 2 unsigned longs, little-endian.
    fp.write(struct.pack("<LL", mtime, size))
    fp.write(marshal.dumps(co))
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

Covered comparison pages: [B134](B134-block6-pytest-pyc-stream.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

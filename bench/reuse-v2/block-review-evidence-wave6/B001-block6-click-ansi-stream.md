# B1: block6-click-ansi-stream

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate-file`
Added: `src/standalone_wave6_ansi_stream.py:1 src/standalone_wave6_ansi_stream.py`
Existing: `src/click/_compat.py:1 src/click/_compat.py`
Probability: `not supplied`

The added module is a partial file fork of src/click/_compat.py, not merely a similar filename: 9 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include _FixupStream -> _FixupStream, _FixupStream.read1 -> _FixupStream.read1, _FixupStream.readable -> _FixupStream.readable, _FixupStream.writable -> _FixupStream.writable. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of Click's Windows ANSI stream wrapping.

This module can be imported by file path without importing Click. It
vendors ``auto_wrap_for_ansi`` from ``click._compat`` as
:func:`vendored_ansi_stream`, together with the private helpers it uses.
"""

from __future__ import annotations

import collections.abc as cabc
import io
import sys
import typing as t
from weakref import WeakKeyDictionary

__all__ = ["vendored_ansi_stream", "vendored_ansi_stream_variant"]


class _NonClosingTextIOWrapper(io.TextIOWrapper):
    def __init__(
        self,
        stream: t.BinaryIO,
        encoding: str | None,
        errors: str | None,
        force_readable: bool = False,
        force_writable: bool = False,
        **extra: t.Any,
    ) -> None:
        self._stream = stream = t.cast(
            t.BinaryIO, _FixupStream(stream, force_readable, force_writable)
        )
        super().__init__(stream, encoding, errors, **extra)

    def __del__(self) -> None:
        try:
            self.detach()
        except Exception:
            pass

    def isatty(self) -> bool:
        # https://bitbucket.org/pypy/pypy/issue/1803
        return self._stream.isatty()


class _FixupStream:
    """The new io interface needs more from streams than streams
    traditionally implement.  As such, this fix-up code is necessary in
    some circumstances.

    The forcing of readable and writable flags are there because some tools
    put badly patched objects on sys (one such offender are certain version
    of jupyter notebook).
    """

    def __init__(
        self,
        stream: t.BinaryIO,
        force_readable: bool = False,
        force_writable: bool = False,
    ):
        self._stream = stream
        self._force_readable = force_readable
        self._force_writable = force_writable

    def __getattr__(self, name: str) -> t.Any:
        return getattr(self._stream, name)

    def read1(self, size: int) -> bytes:
        f = getattr(self._stream, "read1", None)

        if f is not None:
            return t.cast(bytes, f(size))

        return self._stream.read(size)

    def readable(self) -> bool:
        if self._force_readable:
            return True
        x = getattr(self._stream, "readable", None)
        if x is not None:
            return t.cast(bool, x())
        try:
            self._stream.read(0)
        except Exception:
            return False
        return True

    def writable(self) -> bool:
        if self._force_writable:
            return True
        x = getattr(self._stream, "writable", None)
        if x is not None:
            return t.cast(bool, x())
        try:
            self._stream.write(b"")
        except Exception:
            try:
                self._stream.write(b"")
            except Exception:
                return False
        return True

    def seekable(self) -> bool:
        x = getattr(self._stream, "seekable", None)
        if x is not None:
            return t.cast(bool, x())
        try:
            self._stream.seek(self._stream.tell())
        except Exception:
            return False
        return True


def _is_jupyter_kernel_output(stream: t.IO[t.Any]) -> bool:
    while isinstance(stream, (_FixupStream, _NonClosingTextIOWrapper)):
        stream = stream._stream

    return stream.__class__.__module__.startswith("ipykernel.")


def should_strip_ansi(
    stream: t.IO[t.Any] | None = None, color: bool | None = None
) -> bool:
    if color is None:
        if stream is None:
            stream = sys.stdin
        return not isatty(stream) and not _is_jupyter_kernel_output(stream)
    return not color


def isatty(stream: t.IO[t.Any]) -> bool:
    try:
        return stream.isatty()
    except Exception:
        return False


_ansi_stream_wrappers: cabc.MutableMapping[t.TextIO, t.TextIO] = WeakKeyDictionary()


def vendored_ansi_stream(stream: t.TextIO, color: bool | None = None) -> t.TextIO:
    """Support ANSI color and style codes on Windows by wrapping a
    stream with colorama.
    """
    try:
        cached = _ansi_stream_wrappers.get(stream)
    except Exception:
        cached = None

    if cached is not None:
        return cached

    import colorama

    strip = should_strip_ansi(stream, color)
    ansi_wrapper = colorama.AnsiToWin32(stream, strip=strip)
    rv = t.cast(t.TextIO, ansi_wrapper.stream)
    _write = rv.write

    def _safe_write(s: str) -> int:
        try:
            return _write(s)
        except BaseException:
            ansi_wrapper.reset_all()
            raise

    rv.write = _safe_write  # type: ignore[method-assign]

    try:
        _ansi_stream_wrappers[stream] = rv
    except Exception:
        pass

    return rv


def vendored_ansi_stream_variant(
    stream: t.TextIO, color: bool | None = False
) -> t.TextIO:
    """Like :func:`vendored_ansi_stream`, but ``color`` defaults to
    ``False`` instead of ``None``. Explicit values are passed through.
    """
    return vendored_ansi_stream(stream, color)
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/click/_compat.py:82-148
class _FixupStream:
    """The new io interface needs more from streams than streams
    traditionally implement.  As such, this fix-up code is necessary in
    some circumstances.

    The forcing of readable and writable flags are there because some tools
    put badly patched objects on sys (one such offender are certain version
    of jupyter notebook).
    """

    def __init__(
        self,
        stream: t.BinaryIO,
        force_readable: bool = False,
        force_writable: bool = False,
    ):
        self._stream = stream
        self._force_readable = force_readable
        self._force_writable = force_writable

    def __getattr__(self, name: str) -> t.Any:
        return getattr(self._stream, name)

    def read1(self, size: int) -> bytes:
        f = getattr(self._stream, "read1", None)

        if f is not None:
            return t.cast(bytes, f(size))

        return self._stream.read(size)

    def readable(self) -> bool:
        if self._force_readable:
            return True
        x = getattr(self._stream, "readable", None)
        if x is not None:
            return t.cast(bool, x())
        try:
            self._stream.read(0)
        except Exception:
            return False
        return True

    def writable(self) -> bool:
        if self._force_writable:
            return True
        x = getattr(self._stream, "writable", None)
        if x is not None:
            return t.cast(bool, x())
        try:
            self._stream.write(b"")
        except Exception:
            try:
                self._stream.write(b"")
            except Exception:
                return False
        return True

    def seekable(self) -> bool:
        x = getattr(self._stream, "seekable", None)
        if x is not None:
            return t.cast(bool, x())
        try:
            self._stream.seek(self._stream.tell())
        except Exception:
            return False
        return True

# src/click/_compat.py:492-496
def _is_jupyter_kernel_output(stream: t.IO[t.Any]) -> bool:
    while isinstance(stream, (_FixupStream, _NonClosingTextIOWrapper)):
        stream = stream._stream

    return stream.__class__.__module__.startswith("ipykernel.")

# src/click/_compat.py:499-506
def should_strip_ansi(
    stream: t.IO[t.Any] | None = None, color: bool | None = None
) -> bool:
    if color is None:
        if stream is None:
            stream = sys.stdin
        return not isatty(stream) and not _is_jupyter_kernel_output(stream)
    return not color

# src/click/_compat.py:522-555
    def auto_wrap_for_ansi(stream: t.TextIO, color: bool | None = None) -> t.TextIO:
        """Support ANSI color and style codes on Windows by wrapping a
        stream with colorama.
        """
        try:
            cached = _ansi_stream_wrappers.get(stream)
        except Exception:
            cached = None

        if cached is not None:
            return cached

        import colorama

        strip = should_strip_ansi(stream, color)
        ansi_wrapper = colorama.AnsiToWin32(stream, strip=strip)
        rv = t.cast(t.TextIO, ansi_wrapper.stream)
        _write = rv.write

        def _safe_write(s: str) -> int:
            try:
                return _write(s)
            except BaseException:
                ansi_wrapper.reset_all()
                raise

        rv.write = _safe_write  # type: ignore[method-assign]

        try:
            _ansi_stream_wrappers[stream] = rv
        except Exception:
            pass

        return rv
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

Covered comparison pages: [B2](B002-block6-click-ansi-stream.md), [B3](B003-block6-click-ansi-stream.md), [B4](B004-block6-click-ansi-stream.md), [B5](B005-block6-click-ansi-stream.md), [B6](B006-block6-click-ansi-stream.md), [B7](B007-block6-click-ansi-stream.md), [B8](B008-block6-click-ansi-stream.md), [B9](B009-block6-click-ansi-stream.md), [B10](B010-block6-click-ansi-stream.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

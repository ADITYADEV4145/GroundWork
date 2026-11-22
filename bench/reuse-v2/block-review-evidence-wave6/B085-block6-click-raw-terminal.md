# B85: block6-click-raw-terminal

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate-file`
Added: `src/standalone_wave6_raw_terminal.py:1 src/standalone_wave6_raw_terminal.py`
Existing: `src/click/_termui_impl.py:1 src/click/_termui_impl.py`
Probability: `not supplied`

The added module is a partial file fork of src/click/_termui_impl.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_raw_terminal -> raw_terminal. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of Click's POSIX ``raw_terminal`` helper.

This module can be imported by file path without importing Click. It
vendors ``click._termui_impl.raw_terminal`` (POSIX branch) unchanged as
:func:`vendored_raw_terminal`, together with the ``isatty`` helper it
depends on, and adds :func:`vendored_raw_terminal_variant`, which yields
``(fd, "raw")`` instead of just ``fd``.
"""

from __future__ import annotations

import collections.abc as cabc
import contextlib
import os
import sys
import typing as t

__all__ = ["vendored_raw_terminal", "vendored_raw_terminal_variant"]


def isatty(stream: t.IO[t.Any]) -> bool:
    try:
        return stream.isatty()
    except Exception:
        return False


if sys.platform != "win32" and os.name != "nt":
    import termios
    import tty

    @contextlib.contextmanager
    def vendored_raw_terminal() -> cabc.Iterator[int]:
        f: t.TextIO | None
        fd: int

        if not isatty(sys.stdin):
            f = open("/dev/tty")
            fd = f.fileno()
        else:
            fd = sys.stdin.fileno()
            f = None

        try:
            old_settings = termios.tcgetattr(fd)

            try:
                tty.setraw(fd)
                yield fd
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                sys.stdout.flush()

                if f is not None:
                    f.close()
        except termios.error:
            pass

    @contextlib.contextmanager
    def vendored_raw_terminal_variant() -> cabc.Iterator[tuple[int, str]]:
        """Like :func:`vendored_raw_terminal`, but yield ``(fd, "raw")``."""
        with vendored_raw_terminal() as fd:
            yield fd, "raw"
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/click/_termui_impl.py:805-829
    def raw_terminal() -> cabc.Iterator[int]:
        f: t.TextIO | None
        fd: int

        if not isatty(sys.stdin):
            f = open("/dev/tty")
            fd = f.fileno()
        else:
            fd = sys.stdin.fileno()
            f = None

        try:
            old_settings = termios.tcgetattr(fd)

            try:
                tty.setraw(fd)
                yield fd
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                sys.stdout.flush()

                if f is not None:
                    f.close()
        except termios.error:
            pass
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

Covered comparison pages: [B86](B086-block6-click-raw-terminal.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

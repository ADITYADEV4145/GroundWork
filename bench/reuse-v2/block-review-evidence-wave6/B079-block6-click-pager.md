# B79: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:796 vendored_pager`
Existing: `src/click/_termui_impl.py:370 pager`
Probability: `0.9773729704743244`

The complete executable FunctionDef AST of vendored_pager equals the actual named match pager at src/click/_termui_impl.py:370, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include StringIO, _default_text_stdout, _nullpager, _pipepager, _tempfilepager, isatty, os.close, os.environ.get. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def vendored_pager(generator: cabc.Iterable[str], color: bool | None = None) -> None:
    """Decide what method to use for paging through text."""
    stdout = _default_text_stdout()

    # There are no standard streams attached to write to. For example,
    # pythonw on Windows.
    if stdout is None:
        stdout = StringIO()

    if not isatty(sys.stdin) or not isatty(stdout):
        return _nullpager(stdout, generator, color)

    # Split and normalize the pager command into parts.
    pager_cmd_parts = shlex.split(os.environ.get("PAGER", ""), posix=False)
    if pager_cmd_parts:
        if WIN:
            if _tempfilepager(generator, pager_cmd_parts, color):
                return
        elif _pipepager(generator, pager_cmd_parts, color):
            return

    if os.environ.get("TERM") in ("dumb", "emacs"):
        return _nullpager(stdout, generator, color)
    if (WIN or sys.platform.startswith("os2")) and _tempfilepager(
        generator, ["more"], color
    ):
        return
    if _pipepager(generator, ["less"], color):
        return

    import tempfile

    fd, filename = tempfile.mkstemp()
    os.close(fd)
    try:
        if _pipepager(generator, ["more"], color):
            return
        return _nullpager(stdout, generator, color)
    finally:
        os.unlink(filename)
```

## Existing complete symbol (covered excerpts for file findings)

```python
def pager(generator: cabc.Iterable[str], color: bool | None = None) -> None:
    """Decide what method to use for paging through text."""
    stdout = _default_text_stdout()

    # There are no standard streams attached to write to. For example,
    # pythonw on Windows.
    if stdout is None:
        stdout = StringIO()

    if not isatty(sys.stdin) or not isatty(stdout):
        return _nullpager(stdout, generator, color)

    # Split and normalize the pager command into parts.
    pager_cmd_parts = shlex.split(os.environ.get("PAGER", ""), posix=False)
    if pager_cmd_parts:
        if WIN:
            if _tempfilepager(generator, pager_cmd_parts, color):
                return
        elif _pipepager(generator, pager_cmd_parts, color):
            return

    if os.environ.get("TERM") in ("dumb", "emacs"):
        return _nullpager(stdout, generator, color)
    if (WIN or sys.platform.startswith("os2")) and _tempfilepager(
        generator, ["more"], color
    ):
        return
    if _pipepager(generator, ["less"], color):
        return

    import tempfile

    fd, filename = tempfile.mkstemp()
    os.close(fd)
    try:
        if _pipepager(generator, ["more"], color):
            return
        return _nullpager(stdout, generator, color)
    finally:
        os.unlink(filename)
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 0.9946795722966228
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

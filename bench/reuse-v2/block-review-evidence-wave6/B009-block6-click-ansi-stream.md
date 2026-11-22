# B9: block6-click-ansi-stream

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_ansi_stream.py:141 vendored_ansi_stream`
Existing: `src/click/_compat.py:522 auto_wrap_for_ansi`
Probability: `0.9871113830915021`

The complete executable FunctionDef AST of vendored_ansi_stream equals the actual named match auto_wrap_for_ansi at src/click/_compat.py:522, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include _ansi_stream_wrappers.get, _write, ansi_wrapper.reset_all, colorama.AnsiToWin32, should_strip_ansi, t.cast. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
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
```

## Existing complete symbol (covered excerpts for file findings)

```python
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
    "name": "vocabulary",
    "value": 0.9737928356234665
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

# B65: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:503 ConsoleStream`
Existing: `src/click/_winconsole.py:194 ConsoleStream`
Probability: `0.9773539214447677`

The complete executable ClassDef AST of ConsoleStream equals the actual named match ConsoleStream at src/click/_winconsole.py:194, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include getattr, isinstance, self._text_stream.write, self.buffer.isatty, self.buffer.write, self.flush, self.write. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
class ConsoleStream:
        def __init__(self, text_stream: t.TextIO, byte_stream: t.BinaryIO) -> None:
            self._text_stream = text_stream
            self.buffer = byte_stream

        @property
        def name(self) -> str:
            return self.buffer.name

        def write(self, x: t.AnyStr) -> int:
            if isinstance(x, str):
                return self._text_stream.write(x)
            try:
                self.flush()
            except Exception:
                pass
            return self.buffer.write(x)

        def writelines(self, lines: cabc.Iterable[t.AnyStr]) -> None:
            for line in lines:
                self.write(line)

        def __getattr__(self, name: str) -> t.Any:
            return getattr(self._text_stream, name)

        def isatty(self) -> bool:
            return self.buffer.isatty()

        def __repr__(self) -> str:
            return f"<ConsoleStream name={self.name!r} encoding={self.encoding!r}>"
```

## Existing complete symbol (covered excerpts for file findings)

```python
class ConsoleStream:
    def __init__(self, text_stream: t.TextIO, byte_stream: t.BinaryIO) -> None:
        self._text_stream = text_stream
        self.buffer = byte_stream

    @property
    def name(self) -> str:
        return self.buffer.name

    def write(self, x: t.AnyStr) -> int:
        if isinstance(x, str):
            return self._text_stream.write(x)
        try:
            self.flush()
        except Exception:
            pass
        return self.buffer.write(x)

    def writelines(self, lines: cabc.Iterable[t.AnyStr]) -> None:
        for line in lines:
            self.write(line)

    def __getattr__(self, name: str) -> t.Any:
        return getattr(self._text_stream, name)

    def isatty(self) -> bool:
        return self.buffer.isatty()

    def __repr__(self) -> str:
        return f"<ConsoleStream name={self.name!r} encoding={self.encoding!r}>"
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 1
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

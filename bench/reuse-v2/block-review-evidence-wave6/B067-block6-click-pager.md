# B67: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:534 _get_text_stdin`
Existing: `src/click/_winconsole.py:226 _get_text_stdin`
Probability: `0.982638787530041`

The complete executable FunctionDef AST of _get_text_stdin equals the actual named match _get_text_stdin at src/click/_winconsole.py:226, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include ConsoleStream, _NonClosingTextIOWrapper, _WindowsConsoleReader, io.BufferedReader, t.cast. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def _get_text_stdin(buffer_stream: t.BinaryIO) -> t.TextIO:
        text_stream = _NonClosingTextIOWrapper(
            io.BufferedReader(_WindowsConsoleReader(STDIN_HANDLE)),
            "utf-16-le",
            "strict",
            line_buffering=True,
        )
        return t.cast(t.TextIO, ConsoleStream(text_stream, buffer_stream))
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _get_text_stdin(buffer_stream: t.BinaryIO) -> t.TextIO:
    text_stream = _NonClosingTextIOWrapper(
        io.BufferedReader(_WindowsConsoleReader(STDIN_HANDLE)),
        "utf-16-le",
        "strict",
        line_buffering=True,
    )
    return t.cast(t.TextIO, ConsoleStream(text_stream, buffer_stream))
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

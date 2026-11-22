# B70: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:567 _is_console`
Existing: `src/click/_winconsole.py:263 _is_console`
Probability: `0.9482658337615166`

The complete executable FunctionDef AST of _is_console equals the actual named match _is_console at src/click/_winconsole.py:263, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include DWORD, GetConsoleMode, bool, byref, f.fileno, hasattr, msvcrt.get_osfhandle. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def _is_console(f: t.TextIO) -> bool:
        if not hasattr(f, "fileno"):
            return False

        try:
            fileno = f.fileno()
        except (OSError, io.UnsupportedOperation):
            return False

        handle = msvcrt.get_osfhandle(fileno)
        return bool(GetConsoleMode(handle, byref(DWORD())))
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _is_console(f: t.TextIO) -> bool:
    if not hasattr(f, "fileno"):
        return False

    try:
        fileno = f.fileno()
    except (OSError, io.UnsupportedOperation):
        return False

    handle = msvcrt.get_osfhandle(fileno)
    return bool(GetConsoleMode(handle, byref(DWORD())))
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

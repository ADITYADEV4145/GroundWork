# B81: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:928 _tempfilepager`
Existing: `src/click/_termui_impl.py:502 _tempfilepager`
Probability: `0.9482658337615166`

The complete executable FunctionDef AST of _tempfilepager equals the actual named match _tempfilepager at src/click/_termui_impl.py:502, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include ''.join, Path, Path(cmd_filepath).resolve, f.write, get_best_encoding, open_stream, os.close, os.unlink. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def _tempfilepager(
    generator: cabc.Iterable[str], cmd_parts: list[str], color: bool | None
) -> bool:
    """Page through text by invoking a program on a temporary file.

    Returns `True` if the command was found, `False` otherwise and thus another
    pager should be attempted.
    """
    # Split the command into the invoked CLI and its parameters.
    if not cmd_parts:
        return False
    cmd = cmd_parts[0]

    cmd_filepath = which(cmd)
    if not cmd_filepath:
        return False
    # Resolves symlinks and produces a normalized absolute path string.
    cmd_path = Path(cmd_filepath).resolve()

    import subprocess
    import tempfile

    fd, filename = tempfile.mkstemp()
    # TODO: This never terminates if the passed generator never terminates.
    text = "".join(generator)
    if not color:
        text = strip_ansi(text)
    encoding = get_best_encoding(sys.stdout)
    with open_stream(filename, "wb")[0] as f:
        f.write(text.encode(encoding))
    try:
        subprocess.call([str(cmd_path), filename])
    except OSError:
        # Command not found
        pass
    finally:
        os.close(fd)
        os.unlink(filename)

    return True
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _tempfilepager(
    generator: cabc.Iterable[str], cmd_parts: list[str], color: bool | None
) -> bool:
    """Page through text by invoking a program on a temporary file.

    Returns `True` if the command was found, `False` otherwise and thus another
    pager should be attempted.
    """
    # Split the command into the invoked CLI and its parameters.
    if not cmd_parts:
        return False
    cmd = cmd_parts[0]

    cmd_filepath = which(cmd)
    if not cmd_filepath:
        return False
    # Resolves symlinks and produces a normalized absolute path string.
    cmd_path = Path(cmd_filepath).resolve()

    import subprocess
    import tempfile

    fd, filename = tempfile.mkstemp()
    # TODO: This never terminates if the passed generator never terminates.
    text = "".join(generator)
    if not color:
        text = strip_ansi(text)
    encoding = get_best_encoding(sys.stdout)
    with open_stream(filename, "wb")[0] as f:
        f.write(text.encode(encoding))
    try:
        subprocess.call([str(cmd_path), filename])
    except OSError:
        # Command not found
        pass
    finally:
        os.close(fd)
        os.unlink(filename)

    return True
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

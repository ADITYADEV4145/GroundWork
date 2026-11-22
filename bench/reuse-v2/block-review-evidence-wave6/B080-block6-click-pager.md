# B80: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:838 _pipepager`
Existing: `src/click/_termui_impl.py:412 _pipepager`
Probability: `0.9482658337615166`

The complete executable FunctionDef AST of _pipepager equals the actual named match _pipepager at src/click/_termui_impl.py:412, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include ' '.join, Path, Path(cmd_filepath).resolve, c.stdin.close, c.stdin.write, c.terminate, c.wait, dict. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def _pipepager(
    generator: cabc.Iterable[str], cmd_parts: list[str], color: bool | None
) -> bool:
    """Page through text by feeding it to another program. Invoking a
    pager through this might support colors.

    Returns `True` if the command was found, `False` otherwise and thus another
    pager should be attempted.
    """
    # Split the command into the invoked CLI and its parameters.
    if not cmd_parts:
        return False
    cmd = cmd_parts[0]
    cmd_params = cmd_parts[1:]

    cmd_filepath = which(cmd)
    if not cmd_filepath:
        return False
    # Resolves symlinks and produces a normalized absolute path string.
    cmd_path = Path(cmd_filepath).resolve()
    cmd_name = cmd_path.name

    import subprocess

    # Make a local copy of the environment to not affect the global one.
    env = dict(os.environ)

    # If we're piping to less and the user hasn't decided on colors, we enable
    # them by default we find the -R flag in the command line arguments.
    if color is None and cmd_name == "less":
        less_flags = f"{os.environ.get('LESS', '')}{' '.join(cmd_params)}"
        if not less_flags:
            env["LESS"] = "-R"
            color = True
        elif "r" in less_flags or "R" in less_flags:
            color = True

    c = subprocess.Popen(
        [str(cmd_path)] + cmd_params,
        shell=True,
        stdin=subprocess.PIPE,
        env=env,
        errors="replace",
        text=True,
    )
    assert c.stdin is not None
    try:
        for text in generator:
            if not color:
                text = strip_ansi(text)

            c.stdin.write(text)
    except BrokenPipeError:
        # In case the pager exited unexpectedly, ignore the broken pipe error.
        pass
    except Exception as e:
        # In case there is an exception we want to close the pager immediately
        # and let the caller handle it.
        # Otherwise the pager will keep running, and the user may not notice
        # the error message, or worse yet it may leave the terminal in a broken state.
        c.terminate()
        raise e
    finally:
        # We must close stdin and wait for the pager to exit before we continue
        try:
            c.stdin.close()
        # Close implies flush, so it might throw a BrokenPipeError if the pager
        # process exited already.
        except BrokenPipeError:
            pass

        # Less doesn't respect ^C, but catches it for its own UI purposes (aborting
        # search or other commands inside less).
        #
        # That means when the user hits ^C, the parent process (click) terminates,
        # but less is still alive, paging the output and messing up the terminal.
        #
        # If the user wants to make the pager exit on ^C, they should set
        # `LESS='-K'`. It's not our decision to make.
        while True:
            try:
                c.wait()
            except KeyboardInterrupt:
                pass
            else:
                break

    return True
```

## Existing complete symbol (covered excerpts for file findings)

```python
def _pipepager(
    generator: cabc.Iterable[str], cmd_parts: list[str], color: bool | None
) -> bool:
    """Page through text by feeding it to another program. Invoking a
    pager through this might support colors.

    Returns `True` if the command was found, `False` otherwise and thus another
    pager should be attempted.
    """
    # Split the command into the invoked CLI and its parameters.
    if not cmd_parts:
        return False
    cmd = cmd_parts[0]
    cmd_params = cmd_parts[1:]

    cmd_filepath = which(cmd)
    if not cmd_filepath:
        return False
    # Resolves symlinks and produces a normalized absolute path string.
    cmd_path = Path(cmd_filepath).resolve()
    cmd_name = cmd_path.name

    import subprocess

    # Make a local copy of the environment to not affect the global one.
    env = dict(os.environ)

    # If we're piping to less and the user hasn't decided on colors, we enable
    # them by default we find the -R flag in the command line arguments.
    if color is None and cmd_name == "less":
        less_flags = f"{os.environ.get('LESS', '')}{' '.join(cmd_params)}"
        if not less_flags:
            env["LESS"] = "-R"
            color = True
        elif "r" in less_flags or "R" in less_flags:
            color = True

    c = subprocess.Popen(
        [str(cmd_path)] + cmd_params,
        shell=True,
        stdin=subprocess.PIPE,
        env=env,
        errors="replace",
        text=True,
    )
    assert c.stdin is not None
    try:
        for text in generator:
            if not color:
                text = strip_ansi(text)

            c.stdin.write(text)
    except BrokenPipeError:
        # In case the pager exited unexpectedly, ignore the broken pipe error.
        pass
    except Exception as e:
        # In case there is an exception we want to close the pager immediately
        # and let the caller handle it.
        # Otherwise the pager will keep running, and the user may not notice
        # the error message, or worse yet it may leave the terminal in a broken state.
        c.terminate()
        raise e
    finally:
        # We must close stdin and wait for the pager to exit before we continue
        try:
            c.stdin.close()
        # Close implies flush, so it might throw a BrokenPipeError if the pager
        # process exited already.
        except BrokenPipeError:
            pass

        # Less doesn't respect ^C, but catches it for its own UI purposes (aborting
        # search or other commands inside less).
        #
        # That means when the user hits ^C, the parent process (click) terminates,
        # but less is still alive, paging the output and messing up the terminal.
        #
        # If the user wants to make the pager exit on ^C, they should set
        # `LESS='-K'`. It's not our decision to make.
        while True:
            try:
                c.wait()
            except KeyboardInterrupt:
                pass
            else:
                break

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

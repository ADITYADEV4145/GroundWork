# B61: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:442 _WindowsConsoleReader.readinto`
Existing: `src/click/_winconsole.py:131 _WindowsConsoleReader.readinto`
Probability: `0.9482658337615166`

The complete executable FunctionDef AST of _WindowsConsoleReader.readinto equals the actual named match _WindowsConsoleReader.readinto at src/click/_winconsole.py:131, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include GetLastError, HANDLE, OSError, ReadConsoleW, ValueError, byref, c_ulong, get_buffer. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def readinto(self, b: Buffer) -> int:
            bytes_to_be_read = len(b)
            if not bytes_to_be_read:
                return 0
            elif bytes_to_be_read % 2:
                raise ValueError(
                    "cannot read odd number of bytes from UTF-16-LE encoded console"
                )

            buffer = get_buffer(b, writable=True)
            code_units_to_be_read = bytes_to_be_read // 2
            code_units_read = c_ulong()

            rv = ReadConsoleW(
                HANDLE(self.handle),
                buffer,
                code_units_to_be_read,
                byref(code_units_read),
                None,
            )
            if GetLastError() == ERROR_OPERATION_ABORTED:
                # wait for KeyboardInterrupt
                time.sleep(0.1)
            if not rv:
                raise OSError(f"Windows error: {GetLastError()}")

            if buffer[0] == EOF:
                return 0
            return 2 * code_units_read.value
```

## Existing complete symbol (covered excerpts for file findings)

```python
def readinto(self, b: Buffer) -> int:
        bytes_to_be_read = len(b)
        if not bytes_to_be_read:
            return 0
        elif bytes_to_be_read % 2:
            raise ValueError(
                "cannot read odd number of bytes from UTF-16-LE encoded console"
            )

        buffer = get_buffer(b, writable=True)
        code_units_to_be_read = bytes_to_be_read // 2
        code_units_read = c_ulong()

        rv = ReadConsoleW(
            HANDLE(self.handle),
            buffer,
            code_units_to_be_read,
            byref(code_units_read),
            None,
        )
        if GetLastError() == ERROR_OPERATION_ABORTED:
            # wait for KeyboardInterrupt
            time.sleep(0.1)
        if not rv:
            raise OSError(f"Windows error: {GetLastError()}")

        if buffer[0] == EOF:
            return 0
        return 2 * code_units_read.value
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

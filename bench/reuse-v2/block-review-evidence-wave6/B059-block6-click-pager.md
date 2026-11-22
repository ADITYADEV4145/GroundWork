# B59: block6-click-pager

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_pager.py:418 get_buffer`
Existing: `src/click/_winconsole.py:105 get_buffer`
Probability: `0.9841314380539381`

The complete executable FunctionDef AST of get_buffer equals the actual named match get_buffer at src/click/_winconsole.py:105, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include PyBuffer_Release, PyObject_GetBuffer, Py_buffer, buffer_type.from_address, byref, py_object. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def get_buffer(obj: Buffer, writable: bool = False) -> Array[c_char]:
            buf = Py_buffer()
            flags: int = PyBUF_WRITABLE if writable else PyBUF_SIMPLE
            PyObject_GetBuffer(py_object(obj), byref(buf), flags)

            try:
                buffer_type = c_char * buf.len
                out: Array[c_char] = buffer_type.from_address(buf.buf)
                return out
            finally:
                PyBuffer_Release(byref(buf))
```

## Existing complete symbol (covered excerpts for file findings)

```python
def get_buffer(obj: Buffer, writable: bool = False) -> Array[c_char]:
        buf = Py_buffer()
        flags: int = PyBUF_WRITABLE if writable else PyBUF_SIMPLE
        PyObject_GetBuffer(py_object(obj), byref(buf), flags)

        try:
            buffer_type = c_char * buf.len
            out: Array[c_char] = buffer_type.from_address(buf.buf)
            return out
        finally:
            PyBuffer_Release(byref(buf))
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

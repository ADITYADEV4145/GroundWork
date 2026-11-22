# B18: block6-click-console-stream

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate`
Added: `src/standalone_wave6_console_stream.py:93 Py_buffer`
Existing: `src/click/_winconsole.py:87 Py_buffer`
Probability: `0.9769851874184835`

The complete executable ClassDef AST of Py_buffer equals the actual named match Py_buffer at src/click/_winconsole.py:87, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. All return expressions and literal values are preserved. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
class Py_buffer(Structure):
            _fields_ = [  # noqa: RUF012
                ("buf", c_void_p),
                ("obj", py_object),
                ("len", c_ssize_t),
                ("itemsize", c_ssize_t),
                ("readonly", c_int),
                ("ndim", c_int),
                ("format", c_char_p),
                ("shape", c_ssize_p),
                ("strides", c_ssize_p),
                ("suboffsets", c_ssize_p),
                ("internal", c_void_p),
            ]
```

## Existing complete symbol (covered excerpts for file findings)

```python
class Py_buffer(Structure):
        _fields_ = [  # noqa: RUF012
            ("buf", c_void_p),
            ("obj", py_object),
            ("len", c_ssize_t),
            ("itemsize", c_ssize_t),
            ("readonly", c_int),
            ("ndim", c_int),
            ("format", c_char_p),
            ("shape", c_ssize_p),
            ("strides", c_ssize_p),
            ("suboffsets", c_ssize_p),
            ("internal", c_void_p),
        ]
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

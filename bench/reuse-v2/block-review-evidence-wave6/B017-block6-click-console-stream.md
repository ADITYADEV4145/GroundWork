# B17: block6-click-console-stream

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`
Kind: `duplicate-constant`
Added: `src/standalone_wave6_console_stream.py:72 MAX_BYTES_WRITTEN`
Existing: `src/click/_winconsole.py:69 MAX_BYTES_WRITTEN`
Probability: `not supplied`

MAX_BYTES_WRITTEN = 32767 is copied with its exact name and value from the pinned Windows-console module. Both modules also contain the same _WindowsConsoleWriter.write implementation, which uses min(bytes_to_be_written, MAX_BYTES_WRITTEN) // 2 before WriteConsoleW. Thus this is the same console-write cap in the same copied consumer context, not an unrelated occurrence of the number 32767.

## Added complete symbol (complete module for file findings)

```python
MAX_BYTES_WRITTEN = 32767
```

## Existing complete symbol (covered excerpts for file findings)

```python
MAX_BYTES_WRITTEN = 32767
```

## Raw detector signals

```json
[
  {
    "name": "literalMatch",
    "value": 1
  },
  {
    "name": "existingNamedConstant",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

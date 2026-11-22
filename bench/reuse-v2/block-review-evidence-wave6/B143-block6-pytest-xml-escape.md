# B143: block6-pytest-xml-escape

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate`
Added: `src/standalone_wave6_xml_escape.py:26 vendored_xml_escape.repl`
Existing: `src/_pytest/junitxml.py:48 bin_xml_escape.repl`
Probability: `0.9482658337615166`

The complete executable FunctionDef AST of vendored_xml_escape.repl equals the actual named match bin_xml_escape.repl at src/_pytest/junitxml.py:48, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include matchobj.group, ord. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def repl(matchobj: re.Match[str]) -> str:
        i = ord(matchobj.group())
        if i <= 0xFF:
            return f"#x{i:02X}"
        else:
            return f"#x{i:04X}"
```

## Existing complete symbol (covered excerpts for file findings)

```python
def repl(matchobj: re.Match[str]) -> str:
        i = ord(matchobj.group())
        if i <= 0xFF:
            return f"#x{i:02X}"
        else:
            return f"#x{i:04X}"
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

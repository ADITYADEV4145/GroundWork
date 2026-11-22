# B138: block6-pytest-statement-range

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate`
Added: `src/standalone_wave6_statement_range.py:16 vendored_statement_range`
Existing: `src/_pytest/_code/source.py:153 get_statement_startend2`
Probability: `0.99518516862557`

The complete executable FunctionDef AST of vendored_statement_range equals the actual named match get_statement_startend2 at src/_pytest/_code/source.py:153, after ignoring only leading docstrings and the matched declaration name. Signatures, annotations, decorators, branches and nested bodies are preserved. Calls preserved include ast.walk, bisect_right, getattr, isinstance, len, values.append, values.sort. The wrapper-only tweak is outside this copied symbol; the match is a genuine copy, not a behaviorally different namesake.

## Added complete symbol (complete module for file findings)

```python
def vendored_statement_range(lineno: int, node: ast.AST) -> tuple[int, int | None]:
    # Flatten all statements and except handlers into one lineno-list.
    # AST's line numbers start indexing at 1.
    values: list[int] = []
    for x in ast.walk(node):
        if isinstance(x, (ast.stmt, ast.ExceptHandler)):
            # The lineno points to the class/def, so need to include the decorators.
            if isinstance(x, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                for d in x.decorator_list:
                    values.append(d.lineno - 1)
            values.append(x.lineno - 1)
            for name in ("finalbody", "orelse"):
                val: list[ast.stmt] | None = getattr(x, name, None)
                if val:
                    # Treat the finally/orelse part as its own statement.
                    values.append(val[0].lineno - 1 - 1)
    values.sort()
    insert_index = bisect_right(values, lineno)
    start = values[insert_index - 1]
    if insert_index >= len(values):
        end = None
    else:
        end = values[insert_index]
    return start, end
```

## Existing complete symbol (covered excerpts for file findings)

```python
def get_statement_startend2(lineno: int, node: ast.AST) -> tuple[int, int | None]:
    # Flatten all statements and except handlers into one lineno-list.
    # AST's line numbers start indexing at 1.
    values: list[int] = []
    for x in ast.walk(node):
        if isinstance(x, (ast.stmt, ast.ExceptHandler)):
            # The lineno points to the class/def, so need to include the decorators.
            if isinstance(x, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                for d in x.decorator_list:
                    values.append(d.lineno - 1)
            values.append(x.lineno - 1)
            for name in ("finalbody", "orelse"):
                val: list[ast.stmt] | None = getattr(x, name, None)
                if val:
                    # Treat the finally/orelse part as its own statement.
                    values.append(val[0].lineno - 1 - 1)
    values.sort()
    insert_index = bisect_right(values, lineno)
    start = values[insert_index - 1]
    if insert_index >= len(values):
        end = None
    else:
        end = values[insert_index]
    return start, end
```

## Raw detector signals

```json
[
  {
    "name": "vocabulary",
    "value": 0.9654701412983496
  },
  {
    "name": "bindingExact",
    "value": 1
  }
]
```

Complete-symbol comparison result: normalized AST equality = true. This is static duplication evidence; runtime execution of this individual symbol is not claimed.

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

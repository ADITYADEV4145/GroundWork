# B1: block4-click-command-decorator-type-error

Verdict: **agree**

Reviewer: Devin lead review (agent, not Aditya)

The nested decorator exactly copies Group.command.decorator: construct command(*args, **kwargs)(f), register it with self.add_command, and return it; the enclosing exception-type change does not change this body.

Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`

Finding: `duplicate` / `BLOCK`; probability: `0.9841314380539381`.

Added: `src/click/command_decorator_type_error.py:52 CommandDecoratorTypeError.command.decorator`

Existing: `src/click/core.py:1628 Group.command.decorator`

## Added complete symbol

```python
52:         def decorator(f: t.Callable[..., t.Any]) -> Command:
53:             cmd: Command = command(*args, **kwargs)(f)
54:             self.add_command(cmd)
55:             return cmd
```

## Existing complete symbol at the pin

```python
1628:         def decorator(f: t.Callable[..., t.Any]) -> Command:
1629:             cmd: Command = command(*args, **kwargs)(f)
1630:             self.add_command(cmd)
1631:             return cmd
```

ASTs (including signature, annotations and body, excluding source positions) are identical. Neither body delegates to the matched existing decorator. The enclosing methods have only WARN findings, so this pair is not covered by an enclosing-symbol BLOCK.

## Exclusions

No wave-4 duplicate-file BLOCK and no reviewed enclosing-symbol BLOCK cover this row. It remains an independent entry under the unchanged counting rules.

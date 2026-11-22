# B2: block4-click-plain-child-group

Verdict: **agree**

Reviewer: Devin lead review (agent, not Aditya)

The nested decorator exactly copies Group.group.decorator: construct group(*args, **kwargs)(f), register it with self.add_command, and return it; the enclosing child-class selection change does not change this body.

Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`

Finding: `duplicate` / `BLOCK`; probability: `0.9841314380539381`.

Added: `src/click/plain_child_group.py:51 PlainChildGroup.group.decorator`

Existing: `src/click/core.py:1680 Group.group.decorator`

## Added complete symbol

```python
51:         def decorator(f: t.Callable[..., t.Any]) -> Group:
52:             cmd: Group = group(*args, **kwargs)(f)
53:             self.add_command(cmd)
54:             return cmd
```

## Existing complete symbol at the pin

```python
1680:         def decorator(f: t.Callable[..., t.Any]) -> Group:
1681:             cmd: Group = group(*args, **kwargs)(f)
1682:             self.add_command(cmd)
1683:             return cmd
```

ASTs (including signature, annotations and body, excluding source positions) are identical. Neither body delegates to the matched existing decorator. The enclosing methods have only WARN findings, so this pair is not covered by an enclosing-symbol BLOCK.

## Exclusions

No wave-4 duplicate-file BLOCK and no reviewed enclosing-symbol BLOCK cover this row. It remains an independent entry under the unchanged counting rules.

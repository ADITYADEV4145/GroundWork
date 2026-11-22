# B1: block5-click-lower-option-name

Verdict: **agree**

Reviewer: Devin lead review (agent, not Aditya)

Wave 5 is copy-inviting by design. This finding matches an additional copied helper, not the task reference `_normalize_opt`.

The matched _split_opt helper is an exact copy: signature and complete AST are identical at the pinned Click source, preserving alphanumeric, repeated-prefix and single-prefix branches. The public normalize_lower_option tweak lowercases the callback result outside this helper; it does not change the matched helper. The helper is actually called when a normalizer is configured. This is a duplicate of the named match, not merely a similar option-normalization function.

Repository pin: `click@528fd7a798abe0077060c5720e13791a34167f66`

Added: `src/standalone_lower_option_name.py:11 _split_opt`
Existing: `src/click/parser.py:112 _split_opt`

Probability: `0.9482658337615166`

## Added complete symbol

```python
11: def _split_opt(opt: str) -> tuple[str, str]:
12:     first = opt[:1]
13:     if first.isalnum():
14:         return "", opt
15:     if opt[1:2] == first:
16:         return opt[:2], opt[2:]
17:     return first, opt[1:]
```

## Existing complete symbol at the exact pin

```python
112: def _split_opt(opt: str) -> tuple[str, str]:
113:     first = opt[:1]
114:     if first.isalnum():
115:         return "", opt
116:     if opt[1:2] == first:
117:         return opt[:2], opt[2:]
118:     return first, opt[1:]
```

## Signals

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

## Reachability and disconfirming checks

The actual public implementation calls `_split_opt(opt)` after its no-normalizer early return. Executing the complete added module with a configured uppercase callback and a tracked helper records exactly one helper call for `--MiXeD` and returns `--mixed`. Both isolated helpers return identical expected values for ordinary, empty, alphanumeric, doubled, triple and mixed prefixes; both raise TypeError for None. Complete AST equality checks all branches, signatures and annotations, not only these examples. These are focused comparison checks, not acceptance or task-success evaluation.

## Exclusions

There is no enclosing symbol or duplicate-file BLOCK for this row. It contributes one independent pair. No wave-5 hard negative BLOCKs.

## Actual caller

```python
"""Standalone option name normalization for completion metadata."""

import typing as t


class _NormalizationContext(t.Protocol):
    @property
    def token_normalize_func(self) -> t.Callable[[str], str] | None: ...


def _split_opt(opt: str) -> tuple[str, str]:
    first = opt[:1]
    if first.isalnum():
        return "", opt
    if opt[1:2] == first:
        return opt[:2], opt[2:]
    return first, opt[1:]


def normalize_lower_option(opt: str, ctx: _NormalizationContext | None) -> str:
    """Normalize and lowercase the option suffix if a normalizer is configured."""
    if ctx is None or ctx.token_normalize_func is None:
        return opt
    prefix, opt = _split_opt(opt)
    return f"{prefix}{ctx.token_normalize_func(opt).lower()}"
```

# B139: block6-pytest-test-address

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_test_address.py:1 src/standalone_wave6_test_address.py`
Existing: `src/_pytest/junitxml.py:1 src/_pytest/junitxml.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/junitxml.py, not merely a similar filename: 1 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_test_address -> mangle_test_address. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of ``_pytest.junitxml.mangle_test_address``.

This module is importable by file path without loading ``_pytest`` or its
runtime initialization.
"""

from __future__ import annotations

import re
import types


__all__ = ["vendored_test_address", "vendored_test_address_variant"]


# Copied from ``_pytest.nodes.SEP``.
nodes = types.SimpleNamespace(SEP="/")


def vendored_test_address(address: str) -> list[str]:
    path, possible_open_bracket, params = address.partition("[")
    names = path.split("::")
    # Convert file path to dotted path.
    names[0] = names[0].replace(nodes.SEP, ".")
    names[0] = re.sub(r"\.py$", "", names[0])
    # Put any params back.
    names[-1] += possible_open_bracket + params
    return names


def vendored_test_address_variant(address: str) -> tuple[str, ...]:
    """Like :func:`vendored_test_address`, but return a tuple."""
    return tuple(vendored_test_address(address))
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/junitxml.py:447-455
def mangle_test_address(address: str) -> list[str]:
    path, possible_open_bracket, params = address.partition("[")
    names = path.split("::")
    # Convert file path to dotted path.
    names[0] = names[0].replace(nodes.SEP, ".")
    names[0] = re.sub(r"\.py$", "", names[0])
    # Put any params back.
    names[-1] += possible_open_bracket + params
    return names
```

## Raw detector signals

```json
[
  {
    "name": "symbolOverlap",
    "value": 1
  },
  {
    "name": "versionOrSameBasename",
    "value": 0
  }
]
```

Covered comparison pages: [B140](B140-block6-pytest-test-address.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

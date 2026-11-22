# B3: block4-pytest-manifest-suffix-counts

Verdict: **disagree**

Reviewer: Devin lead review (agent, not Aditya)

This is a false-positive grounding BLOCK, not a duplicate pair (existing is null): test line 42 passes one generator argument to manifest_suffix_counts(names). CPython accepts it and returns {".py": 2}; the Python extractor incorrectly records zero arguments for generator_expression.

Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`

Finding: `grounding` / `BLOCK`; probability: `not supplied`.

Added: `testing/test_manifest_suffix_counts.py:42 manifest_suffix_counts`

Existing: **none** (`existing: null`). This is not duplicate-symbol evidence.

## Actual test call

```python
41: def test_accepts_any_iterable() -> None:
42:     assert manifest_suffix_counts(n for n in ["a.py", "b.py"]) == {".py": 2}
```

## Added callable

```python
"""Summarize the file suffixes found in a manifest of path strings."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable


NO_SUFFIX = "<none>"


def _final_suffix(name: str) -> str:
    """Return the lowercased final suffix of ``name``, or :data:`NO_SUFFIX`.

    Follows :attr:`pathlib.PurePath.suffix`: leading dots (hidden files) and a
    trailing dot do not form a suffix.
    """
    basename = name.rpartition("/")[2]
    dot = basename.rfind(".")
    if 0 < dot < len(basename) - 1:
        return basename[dot:].lower()
    return NO_SUFFIX


def manifest_suffix_counts(names: Iterable[str]) -> dict[str, int]:
    """Count the lowercased final suffix of each manifest entry in ``names``.

    Entries without a suffix are counted under ``"<none>"``. Entries ending
    with ``/`` denote directories and are ignored.

    The entries are treated purely as strings: the filesystem is never
    consulted, so this works for manifests of files that do not exist locally.

    :returns: A dictionary mapping suffix to count, with keys in sorted order.
    """
    counts = Counter(_final_suffix(name) for name in names if not name.endswith("/"))
    return dict(sorted(counts.items()))
```

## Stored grounding error

```json
{
  "file": "testing/test_manifest_suffix_counts.py",
  "line": 42,
  "kind": "arity",
  "name": "manifest_suffix_counts",
  "message": "manifest_suffix_counts() is missing required argument 'names' \u2014 def manifest_suffix_counts(names: Iterable[str]) -> dict[str, int] (src/_pytest/manifest_suffix_counts.py:25).",
  "blocking": true,
  "suggestions": []
}
```

See `grounding-reproduction.txt`: the actual test passes one argument and returns the expected result, while the current extractor records zero. The empty-generator and truly-missing-argument controls distinguish this false positive from a real arity error. No existing symbol can be compared or reused for this finding.

## Exclusions

No wave-4 duplicate-file BLOCK and no reviewed enclosing-symbol BLOCK cover this row. It remains an independent entry under the unchanged counting rules.

# B141: block6-pytest-xml-escape

Verdict: **agree**
Reviewer: Devin lead review (agent, not Aditya)
Repository pin: `pytest@1b1375ff57b8c2f1d666306fee1fa81747156218`
Kind: `duplicate-file`
Added: `src/standalone_wave6_xml_escape.py:1 src/standalone_wave6_xml_escape.py`
Existing: `src/_pytest/junitxml.py:1 src/_pytest/junitxml.py`
Probability: `not supplied`

The added module is a partial file fork of src/_pytest/junitxml.py, not merely a similar filename: 2 accompanying symbol/constant BLOCKs in this exact file pair have matching complete ASTs. Examples include vendored_xml_escape -> bin_xml_escape, vendored_xml_escape.repl -> bin_xml_escape.repl. The wrapper adds the requested behavior outside those copied bodies. Agree on the duplicated file content; this row is covered by the reviewed symbol-level rows and adds no independent pair.

## Added complete symbol (complete module for file findings)

```python
"""Standalone copy of ``_pytest.junitxml.bin_xml_escape``.

This module depends only on the standard library so it can be imported by
file path without loading pytest.
"""

from __future__ import annotations

import re


__all__ = ["vendored_xml_escape", "vendored_xml_escape_variant"]


def vendored_xml_escape(arg: object) -> str:
    r"""Visually escape invalid XML characters.

    For example, transforms
        'hello\aworld\b'
    into
        'hello#x07world#x08'
    Note that the #xABs are *not* XML escapes - missing the ampersand &#xAB.
    The idea is to escape visually for the user rather than for XML itself.
    """

    def repl(matchobj: re.Match[str]) -> str:
        i = ord(matchobj.group())
        if i <= 0xFF:
            return f"#x{i:02X}"
        else:
            return f"#x{i:04X}"

    # The spec range of valid chars is:
    # Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
    # For an unknown(?) reason, we disallow #x7F (DEL) as well.
    illegal_xml_re = (
        "[^\u0009\u000a\u000d\u0020-\u007e\u0080-\ud7ff\ue000-\ufffd\u10000-\u10ffff]"
    )
    return re.sub(illegal_xml_re, repl, str(arg))


def vendored_xml_escape_variant(arg: object) -> str:
    """Like :func:`vendored_xml_escape`, but prefix the result with ``"xml:"``."""
    return "xml:" + vendored_xml_escape(arg)
```

## Existing complete symbol (covered excerpts for file findings)

```python
# src/_pytest/junitxml.py:37-61
def bin_xml_escape(arg: object) -> str:
    r"""Visually escape invalid XML characters.

    For example, transforms
        'hello\aworld\b'
    into
        'hello#x07world#x08'
    Note that the #xABs are *not* XML escapes - missing the ampersand &#xAB.
    The idea is to escape visually for the user rather than for XML itself.
    """

    def repl(matchobj: re.Match[str]) -> str:
        i = ord(matchobj.group())
        if i <= 0xFF:
            return f"#x{i:02X}"
        else:
            return f"#x{i:04X}"

    # The spec range of valid chars is:
    # Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
    # For an unknown(?) reason, we disallow #x7F (DEL) as well.
    illegal_xml_re = (
        "[^\u0009\u000a\u000d\u0020-\u007e\u0080-\ud7ff\ue000-\ufffd\u10000-\u10ffff]"
    )
    return re.sub(illegal_xml_re, repl, str(arg))
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

Covered comparison pages: [B142](B142-block6-pytest-xml-escape.md), [B143](B143-block6-pytest-xml-escape.md).

See [README](README.md) for scorer reachability, runtime limitations and coverage rules.

from __future__ import annotations

import collections.abc as cabc

from .http import dump_header


def dump_preference_applied(applied: cabc.Mapping[str, str | None]) -> str:
    return dump_header(applied)

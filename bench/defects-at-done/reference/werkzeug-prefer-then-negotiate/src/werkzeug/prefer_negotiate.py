from __future__ import annotations

import collections.abc as cabc
import typing as t

from .prefer import parse_prefer
from .prefer_applied import dump_preference_applied


def negotiate_preferences(
    environ: dict[str, t.Any], supported: cabc.Collection[str]
) -> tuple[dict[str, str | None], str]:
    kept = {
        k: v for k, v in parse_prefer(environ.get("HTTP_PREFER")).items() if k in supported
    }
    return kept, dump_preference_applied(kept)

from __future__ import annotations

import collections.abc as cabc
import datetime as dt

from .http import parse_date


def seconds_until_stale(headers: cabc.Mapping[str, str], now: dt.datetime) -> int | None:
    expires = parse_date(headers.get("Expires"))
    if expires is None:
        return None
    return int((expires - now).total_seconds())

from __future__ import annotations

import collections.abc as cabc
import datetime as dt

from .freshness import seconds_until_stale
from .http import http_date
from .validators import make_validators


def revalidation_headers(
    data: bytes, modified: dt.datetime, expires: dt.datetime
) -> dict[str, str]:
    return {**make_validators(data, modified), "Expires": http_date(expires)}


def is_fresh(headers: cabc.Mapping[str, str], now: dt.datetime) -> bool:
    left = seconds_until_stale(headers, now)
    return left is not None and left > 0

from __future__ import annotations

import datetime as dt

from .http import _generate_etag
from .http import _quote_etag
from .http import http_date


def make_validators(data: bytes, modified: dt.datetime) -> dict[str, str]:
    return {
        "ETag": _quote_etag(_generate_etag(data)),
        "Last-Modified": http_date(modified),
    }

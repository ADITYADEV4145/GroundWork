from __future__ import annotations

from .http import parse_dict_header


def parse_prefer(value: str | None) -> dict[str, str | None]:
    if not value:
        return {}
    return {k.lower(): v for k, v in parse_dict_header(value).items()}

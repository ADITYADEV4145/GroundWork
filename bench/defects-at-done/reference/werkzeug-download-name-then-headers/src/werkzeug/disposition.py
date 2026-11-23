from __future__ import annotations

from .http import dump_options_header


def content_disposition(name: str, inline: bool = False) -> str:
    return dump_options_header("inline" if inline else "attachment", {"filename": name})

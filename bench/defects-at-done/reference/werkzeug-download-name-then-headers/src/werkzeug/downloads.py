from __future__ import annotations

from .utils import secure_filename


def safe_download_name(name: str, default: str = "download") -> str:
    return secure_filename(name) or default

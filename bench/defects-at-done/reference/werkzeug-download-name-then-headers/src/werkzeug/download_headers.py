from __future__ import annotations

import mimetypes

from .disposition import content_disposition
from .downloads import safe_download_name


def download_headers(name: str, data: bytes, inline: bool = False) -> dict[str, str]:
    safe = safe_download_name(name)
    return {
        "Content-Disposition": content_disposition(safe, inline),
        "Content-Type": mimetypes.guess_type(safe)[0] or "application/octet-stream",
        "Content-Length": str(len(data)),
    }

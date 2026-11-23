import re
import unicodedata


def snake_join(text: str) -> str:
    """Lowercase, strip accents and join words with single underscores: "Café  Noir, Ltd." -> "cafe_noir_ltd"."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", plain.lower()).strip("_")

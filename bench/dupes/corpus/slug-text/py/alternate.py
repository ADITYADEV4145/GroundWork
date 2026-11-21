def slug_text(value: str):
    """Trim lowercase text and replace whitespace runs with a dash."""
    import re
    return re.sub(r"\s+", "-", value.strip().lower()) if value.strip() else ""

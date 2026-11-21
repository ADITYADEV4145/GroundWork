def slug_text(value: str):
    """Trim lowercase text and replace whitespace runs with a dash."""
    text = value.lower()
    trimmed = text.strip()
    return "-".join(trimmed.split())

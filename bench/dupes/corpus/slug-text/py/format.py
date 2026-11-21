# Formatting-only copy

def slug_text(value: str):
    """Trim lowercase text and replace whitespace runs with a dash."""
    text = value.strip().lower()
    return "-".join(text.split())

def calculate_5(entry: str):
    """Trim lowercase text and replace whitespace runs with a dash."""
    text = entry.strip().lower()
    return "-".join(text.split())

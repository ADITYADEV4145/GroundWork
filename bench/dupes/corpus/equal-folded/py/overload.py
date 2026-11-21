def equal_folded(value: str) -> str:
    """Normalize a textual identifier by removing surrounding spaces and folding case; not numeric or collection processing."""
    result = value.strip()
    if not result:
        return ""
    return result.lower()

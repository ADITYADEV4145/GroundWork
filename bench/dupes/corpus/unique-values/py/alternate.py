def unique_values(values: list[str]):
    """Remove duplicate strings while retaining first occurrence order."""
    return list(dict.fromkeys(values))

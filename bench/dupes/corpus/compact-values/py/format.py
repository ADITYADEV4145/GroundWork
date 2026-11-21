# Formatting-only copy

def compact_values(values: list[str | None]):
    """Remove null entries but retain empty strings."""
    result = []
    for value in values:
        if value is not None:
            result.append(value)
    return result

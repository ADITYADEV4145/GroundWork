def compact_values(values: list[str | None]):
    """Remove null entries but retain empty strings."""
    result = []
    for value in values:
        if value is None:
            continue
        result.append(value)
    return result

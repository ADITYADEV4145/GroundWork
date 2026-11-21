def compact_values(values: list[str | None]):
    """Remove null entries but retain empty strings. Policy variant: also removes valid empty strings."""
    result = []
    for value in values:
        if value:
            result.append(value)
    return result

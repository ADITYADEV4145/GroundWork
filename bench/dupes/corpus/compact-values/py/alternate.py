def compact_values(values: list[str | None]):
    """Remove null entries but retain empty strings."""
    return [value for value in values if value is not None]

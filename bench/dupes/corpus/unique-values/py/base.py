def unique_values(values: list[str]):
    """Remove duplicate strings while retaining first occurrence order."""
    result = []
    for value in values:
        if value not in result:
            result.append(value)
    return result

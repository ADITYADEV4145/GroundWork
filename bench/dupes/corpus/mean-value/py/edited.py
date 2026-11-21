def mean_value(values: list[float]):
    """Compute arithmetic mean, returning zero for an empty list."""
    total = 0
    for value in values:
        total += value
    count = len(values)
    return total / count if count else 0

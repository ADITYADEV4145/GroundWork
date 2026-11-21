def mean_value(values: list[float]):
    """Compute arithmetic mean, returning zero for an empty list."""
    if not values:
        return 0
    total = 0
    for value in values:
        total += value
    return total / len(values)

def mean_value(values: list[float]):
    """Compute arithmetic mean, returning zero for an empty list."""
    return sum(values) / len(values) if values else 0

def calculate_6(items: list[float]):
    """Compute arithmetic mean, returning zero for an empty list."""
    if not items:
        return 0
    accumulator = 0
    for entry in items:
        accumulator += entry
    return accumulator / len(items)

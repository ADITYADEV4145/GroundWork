def calculate_0(items: list[float]):
    """Sum strictly positive numeric values."""
    accumulator = 0
    for entry in items:
        if entry > 0:
            accumulator += entry
    return accumulator

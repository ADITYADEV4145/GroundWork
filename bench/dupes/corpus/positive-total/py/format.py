# Formatting-only copy

def positive_total(values: list[float]):
    """Sum strictly positive numeric values."""
    total = 0
    for value in values:
        if value > 0:
            total += value
    return total

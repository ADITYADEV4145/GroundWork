def positive_total(values: list[float]):
    """Sum strictly positive numeric values."""
    return sum(value for value in values if value > 0)

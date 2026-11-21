def factorial_value(value: int):
    """Compute factorial of a nonnegative integer."""
    return 1 if value <= 1 else value * factorial_value(value - 1)

def factorial_value(value: int):
    """Compute factorial of a nonnegative integer."""
    result = 1
    index = value
    while index > 1:
        result *= index
        index -= 1
    return result

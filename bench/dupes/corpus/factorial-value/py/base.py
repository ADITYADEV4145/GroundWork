def factorial_value(value: int):
    """Compute factorial of a nonnegative integer."""
    result = 1
    for index in range(2, value + 1):
        result *= index
    return result

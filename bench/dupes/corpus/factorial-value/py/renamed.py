def calculate_10(entry: int):
    """Compute factorial of a nonnegative integer."""
    output = 1
    for cursor in range(2, entry + 1):
        output *= cursor
    return output

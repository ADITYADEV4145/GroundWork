def calculate_1(items: list[bool]):
    """Count enabled boolean flags."""
    accumulator = 0
    for entry in items:
        if entry:
            accumulator += 1
    return accumulator

def active_count(values: list[bool]):
    """Count enabled boolean flags."""
    total = 0
    for value in values:
        if not value:
            continue
        total += 1
    return total

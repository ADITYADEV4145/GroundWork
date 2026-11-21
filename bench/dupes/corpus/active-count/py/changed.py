def active_count(values: list[bool]):
    """Count enabled boolean flags. Policy variant: counts disabled rather than enabled flags."""
    total = 0
    for value in values:
        if not value:
            total += 1
    return total

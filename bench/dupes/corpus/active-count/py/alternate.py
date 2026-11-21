def active_count(values: list[bool]):
    """Count enabled boolean flags."""
    return sum(map(bool, values))

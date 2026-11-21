# Formatting-only copy

def active_count(values: list[bool]):
    """Count enabled boolean flags."""
    total = 0
    for value in values:
        if value:
            total += 1
    return total

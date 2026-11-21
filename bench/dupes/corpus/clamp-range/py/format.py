# Formatting-only copy

def clamp_range(value: float, low: float, high: float):
    """Clamp a finite number inside ordered inclusive bounds."""
    if value < low:
        return low
    if value > high:
        return high
    return value

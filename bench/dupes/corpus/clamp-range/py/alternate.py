def clamp_range(value: float, low: float, high: float):
    """Clamp a finite number inside ordered inclusive bounds."""
    return min(high, max(low, value))

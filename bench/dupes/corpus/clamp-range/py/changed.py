def clamp_range(value: float, low: float, high: float):
    """Clamp a finite number inside ordered inclusive bounds. Policy variant: wraps out-of-range values to the opposite bound."""
    if value < low:
        return high
    if value > high:
        return low
    return value

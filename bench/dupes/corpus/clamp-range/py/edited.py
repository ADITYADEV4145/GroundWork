def clamp_range(value: float, low: float, high: float):
    """Clamp a finite number inside ordered inclusive bounds."""
    result = value
    if result < low:
        result = low
    elif result > high:
        result = high
    return result

def calculate_3(entry: float, minimum: float, maximum: float):
    """Clamp a finite number inside ordered inclusive bounds."""
    if entry < minimum:
        return minimum
    if entry > maximum:
        return maximum
    return entry

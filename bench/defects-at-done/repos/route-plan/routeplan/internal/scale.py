import math


def billable_kg(kg: float) -> float:
    """Weight a carrier bills for: rounded up to the next half kilogram, never less than one kilogram."""
    return max(1.0, math.ceil(kg * 2 - 1e-9) / 2)

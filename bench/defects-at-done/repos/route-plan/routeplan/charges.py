import math


def round_charge(amount: float) -> float:
    """Round a charge up to the next 0.05. Every amount billed to a customer uses this."""
    return round(math.ceil(amount * 20 - 1e-9) / 20, 2)

import math


def round_up_to_five(minutes: float) -> int:
    """Round a duration up to the next multiple of five minutes. Every customer-facing time uses this."""
    return int(math.ceil(minutes / 5.0 - 1e-9) * 5)

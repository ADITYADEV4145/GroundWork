def load_ratio(weight_kg: float, *, capacity_kg: float) -> float:
    """Share of a vehicle's capacity in use: load_ratio(weight_kg, capacity_kg=...), to three decimals."""
    return round(weight_kg / capacity_kg, 3)

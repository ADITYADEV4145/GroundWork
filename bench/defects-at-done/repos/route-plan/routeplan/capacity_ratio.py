def load_ratio(capacity_kg: float, weight_kg: float) -> float:
    """Share of a vehicle's capacity in use: load_ratio(capacity_kg, weight_kg), to three decimals."""
    return round(weight_kg / capacity_kg, 3)

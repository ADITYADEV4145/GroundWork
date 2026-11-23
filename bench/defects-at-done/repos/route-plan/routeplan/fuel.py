def fuel_litres(rate_l_per_100km: float, distance_km: float) -> float:
    """Litres burned over a distance: fuel_litres(rate_l_per_100km, distance_km), to two decimals."""
    return round(distance_km * rate_l_per_100km / 100, 2)

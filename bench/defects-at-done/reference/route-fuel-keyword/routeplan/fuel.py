def fuel_litres(distance_km: float, *, rate_l_per_100km: float = 8.5) -> float:
    """Litres burned over a distance: fuel_litres(distance_km, rate_l_per_100km=8.5), to two decimals."""
    return round(distance_km * rate_l_per_100km / 100, 2)

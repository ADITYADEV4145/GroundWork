from routeplan.rounding import round_up_to_five


def eta_minutes(speed_kph: float, distance_km: float) -> int:
    """Minutes to cover a distance: eta_minutes(speed_kph, distance_km)."""
    return round_up_to_five(distance_km / speed_kph * 60)

from routeplan.rounding import round_up_to_five


def eta_minutes(distance_km: float, *, speed_kph: float = 40) -> int:
    """Minutes to cover a distance: eta_minutes(distance_km, speed_kph=...)."""
    return round_up_to_five(distance_km / speed_kph * 60)

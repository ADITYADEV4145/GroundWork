from routeplan.rounding import round_up_to_five


def pickup_window(distance_km: float, speed_kph: float) -> int:
    return round_up_to_five(distance_km / speed_kph * 60 + 10)

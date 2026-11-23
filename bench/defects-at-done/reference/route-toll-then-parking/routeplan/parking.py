from routeplan.charges import round_charge


def parking_charge(minutes: int, rate_per_hour: float) -> float:
    return round_charge(minutes / 60 * rate_per_hour)

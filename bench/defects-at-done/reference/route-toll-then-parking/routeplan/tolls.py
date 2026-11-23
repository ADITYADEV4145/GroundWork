from routeplan.charges import round_charge


def toll_charge(distance_km: float, rate_per_km: float) -> float:
    return round_charge(distance_km * rate_per_km + 1.5)

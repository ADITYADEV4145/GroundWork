from routeplan.fuel import fuel_litres
from routeplan.models import Stop


def trip_cost(stops: list[Stop], rate_l_per_100km: float, price_per_litre: float) -> float:
    # fuel_litres(rate_l_per_100km, distance_km) for the whole trip
    litres = fuel_litres(rate_l_per_100km, sum(stop.distance_km for stop in stops))
    return round(litres * price_per_litre, 2)


def leg_costs(stops: list[Stop], rate_l_per_100km: float, price_per_litre: float) -> dict[str, float]:
    return {stop.name: round(fuel_litres(rate_l_per_100km, stop.distance_km) * price_per_litre, 2) for stop in stops}

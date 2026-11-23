from routeplan.fuel import fuel_litres
from routeplan.models import Stop


def trip_cost(stops: list[Stop], rate_l_per_100km: float, price_per_litre: float) -> float:
    litres = fuel_litres(sum(stop.distance_km for stop in stops), rate_l_per_100km=rate_l_per_100km)
    return round(litres * price_per_litre, 2)


def leg_costs(stops: list[Stop], rate_l_per_100km: float, price_per_litre: float) -> dict[str, float]:
    return {stop.name: round(fuel_litres(stop.distance_km, rate_l_per_100km=rate_l_per_100km) * price_per_litre, 2) for stop in stops}

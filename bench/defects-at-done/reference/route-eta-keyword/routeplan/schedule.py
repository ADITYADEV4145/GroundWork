from routeplan.models import Stop
from routeplan.timing import eta_minutes


def stop_etas(stops: list[Stop], speed_kph: float) -> dict[str, int]:
    # one eta_minutes(distance_km, speed_kph=...) per stop
    return {stop.name: eta_minutes(stop.distance_km, speed_kph=speed_kph) for stop in stops}

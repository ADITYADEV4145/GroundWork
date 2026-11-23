from routeplan.models import Stop
from routeplan.timing import eta_minutes


def stop_etas(stops: list[Stop], speed_kph: float) -> dict[str, int]:
    # one eta_minutes(speed_kph, distance_km) per stop
    return {stop.name: eta_minutes(speed_kph, stop.distance_km) for stop in stops}

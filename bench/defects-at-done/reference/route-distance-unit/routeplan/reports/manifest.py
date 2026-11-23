from routeplan.distance import format_distance
from routeplan.models import Stop


def manifest_line(stop: Stop) -> str:
    return f"Leg: {format_distance(stop.distance_km, stop.unit)}"

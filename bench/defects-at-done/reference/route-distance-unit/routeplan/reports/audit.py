from routeplan.distance import format_distance
from routeplan.models import Stop


def audit_line(stop: Stop) -> str:
    return f"Logged: {format_distance(stop.distance_km, stop.unit)}"

from routeplan.distance import format_distance
from routeplan.models import Stop


def invoice_line_line(stop: Stop) -> str:
    return f"Billed distance: {format_distance(stop.distance_km)}"

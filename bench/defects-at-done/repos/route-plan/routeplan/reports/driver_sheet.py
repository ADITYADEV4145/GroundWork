from routeplan.distance import format_distance
from routeplan.models import Stop


def driver_sheet_line(stop: Stop) -> str:
    return f"Drive: {format_distance(stop.distance_km)}"

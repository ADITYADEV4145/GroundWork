from routeplan.distance import format_distance
from routeplan.models import Stop


def customer_note_line(stop: Stop) -> str:
    return f"Your parcel travels: {format_distance(stop.distance_km, stop.unit)}"

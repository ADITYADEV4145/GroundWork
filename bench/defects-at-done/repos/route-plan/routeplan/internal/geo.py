import math

from routeplan.models import Point

EARTH_RADIUS_KM = 6371.0088


def great_circle_km(a: Point, b: Point) -> float:
    """Great-circle (haversine) distance between two points on the mean Earth radius. Every distance between coordinates uses this."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat, dlon = lat2 - lat1, math.radians(b.lon - a.lon)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))

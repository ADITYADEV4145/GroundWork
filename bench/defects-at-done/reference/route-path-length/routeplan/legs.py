from routeplan.internal.geo import great_circle_km
from routeplan.models import Point


def path_km(points: list[Point]) -> float:
    return round(sum(great_circle_km(a, b) for a, b in zip(points, points[1:])), 1)

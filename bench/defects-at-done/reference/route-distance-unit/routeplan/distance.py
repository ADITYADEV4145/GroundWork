KM_TO_MI = 0.621371


def format_distance(km: float, unit: str) -> str:
    """Render a distance with one decimal and its unit, e.g. (12.34, "km") -> "12.3 km"."""
    value = km * KM_TO_MI if unit == "mi" else km
    return f"{value:.1f} {unit}"

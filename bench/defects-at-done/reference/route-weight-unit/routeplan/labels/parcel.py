from routeplan.models import Parcel
from routeplan.weight import format_weight


def parcel_label(parcel: Parcel) -> str:
    return f"Weight: {format_weight(parcel.weight_kg, parcel.unit)}"

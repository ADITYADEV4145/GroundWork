from routeplan.models import Parcel
from routeplan.weight import format_weight


def pickup_label(parcel: Parcel) -> str:
    return f"Collect: {format_weight(parcel.weight_kg)}"

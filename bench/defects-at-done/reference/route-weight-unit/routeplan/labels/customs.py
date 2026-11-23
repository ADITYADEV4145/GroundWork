from routeplan.models import Parcel
from routeplan.weight import format_weight


def customs_label(parcel: Parcel) -> str:
    return f"Declared weight: {format_weight(parcel.weight_kg, parcel.unit)}"

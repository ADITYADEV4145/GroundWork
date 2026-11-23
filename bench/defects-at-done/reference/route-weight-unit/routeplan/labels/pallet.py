from routeplan.models import Parcel
from routeplan.weight import format_weight


def pallet_label(parcel: Parcel) -> str:
    return f"Gross: {format_weight(parcel.weight_kg, parcel.unit)}"

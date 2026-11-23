from routeplan.capacity_ratio import load_ratio
from routeplan.models import Parcel, Vehicle


def overloaded(vehicle: Vehicle, parcels: list[Parcel]) -> bool:
    # load_ratio(capacity_kg, weight_kg) above 1 means too heavy
    return load_ratio(vehicle.capacity_kg, sum(p.weight_kg for p in parcels)) > 1


def spare_kg(vehicle: Vehicle, parcels: list[Parcel]) -> float:
    used = load_ratio(vehicle.capacity_kg, sum(p.weight_kg for p in parcels))
    return round(vehicle.capacity_kg * (1 - used), 1)

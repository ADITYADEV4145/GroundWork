from routeplan.capacity_ratio import load_ratio
from routeplan.models import Parcel, Vehicle


def overloaded(vehicle: Vehicle, parcels: list[Parcel]) -> bool:
    return load_ratio(sum(p.weight_kg for p in parcels), capacity_kg=vehicle.capacity_kg) > 1


def spare_kg(vehicle: Vehicle, parcels: list[Parcel]) -> float:
    used = load_ratio(sum(p.weight_kg for p in parcels), capacity_kg=vehicle.capacity_kg)
    return round(vehicle.capacity_kg * (1 - used), 1)

from routeplan.fleet import Fleet


def vehicle_capacity(fleet: Fleet, plate: str) -> int | None:
    vehicle = fleet.find_by_plate(plate, in_service_only=True)
    return vehicle.capacity_kg if vehicle else None

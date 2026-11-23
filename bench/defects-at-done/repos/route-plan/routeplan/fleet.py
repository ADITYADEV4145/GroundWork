from routeplan.models import Vehicle


class Fleet:
    def __init__(self, vehicles: list[Vehicle]):
        self._vehicles = list(vehicles)

    def find_by_label(self, label: str) -> list[Vehicle]:
        """All vehicles carrying a label such as "van" or "truck", in service or not."""
        return [v for v in self._vehicles if v.label == label]

    def find_by_plate(self, plate: str, *, in_service_only: bool) -> Vehicle | None:
        """Plates match in any letter case with spaces and dashes ignored. Vehicles out of service are skipped when in_service_only is set."""
        wanted = _plain(plate)
        for vehicle in self._vehicles:
            if _plain(vehicle.plate) == wanted and (vehicle.in_service or not in_service_only):
                return vehicle
        return None


def _plain(plate: str) -> str:
    return plate.replace(" ", "").replace("-", "").upper()

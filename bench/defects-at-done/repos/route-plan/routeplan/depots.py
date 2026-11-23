from routeplan.models import Depot


class DepotBook:
    def __init__(self, depots: list[Depot]):
        self._depots = list(depots)

    def find_by_zone(self, zone: str) -> list[Depot]:
        """All depots serving a zone, active or not."""
        return [d for d in self._depots if d.zone == zone]

    def find_by_code(self, code: str, *, active_only: bool) -> Depot | None:
        """Depot codes are case-insensitive. Inactive depots are skipped when active_only is set."""
        wanted = code.strip().upper()
        for depot in self._depots:
            if depot.code.upper() == wanted and (depot.active or not active_only):
                return depot
        return None

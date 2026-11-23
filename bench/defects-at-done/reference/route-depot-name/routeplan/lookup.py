from routeplan.depots import DepotBook


def depot_name(book: DepotBook, code: str) -> str | None:
    depot = book.find_by_code(code, active_only=True)
    return depot.name if depot else None

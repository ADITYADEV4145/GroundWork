from routeplan.internal.scale import billable_kg


def pallet_billable(weights: list[float]) -> float:
    return billable_kg(sum(weights) + 20)

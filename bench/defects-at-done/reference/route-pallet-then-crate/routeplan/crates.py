from routeplan.internal.scale import billable_kg


def crate_billable(weights: list[float], crates: int) -> float:
    return billable_kg(sum(weights) + 4.5 * crates)

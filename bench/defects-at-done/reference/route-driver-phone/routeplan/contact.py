from routeplan.drivers import DriverRoster


def driver_phone(roster: DriverRoster, badge: str) -> str | None:
    driver = roster.lookup_badge(badge)
    return driver.phone if driver else None

import re

from routeplan.models import Driver


class DriverRoster:
    def __init__(self, drivers: list[Driver]):
        self._drivers = list(drivers)

    def lookup_name(self, name: str) -> list[Driver]:
        """Every driver with that exact name, on duty or not."""
        return [d for d in self._drivers if d.name == name]

    def lookup_badge(self, badge: str, *, include_off_duty: bool = False) -> Driver | None:
        """Badges match in any letter case with zeros before the number ignored ("D007" is "d7"). Off-duty drivers are skipped unless include_off_duty is set."""
        wanted = _plain(badge)
        for driver in self._drivers:
            if _plain(driver.badge) == wanted and (driver.on_duty or include_off_duty):
                return driver
        return None


def _plain(badge: str) -> str:
    return re.sub(r"(?<!\d)0+(?=\d)", "", badge.strip().upper())

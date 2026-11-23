from dataclasses import dataclass


@dataclass(frozen=True)
class Depot:
    code: str
    zone: str
    name: str
    active: bool = True


@dataclass(frozen=True)
class Stop:
    name: str
    sequence: int
    distance_km: float
    unit: str = "km"

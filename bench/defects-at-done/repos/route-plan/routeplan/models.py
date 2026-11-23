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


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float


@dataclass(frozen=True)
class Vehicle:
    plate: str
    label: str
    capacity_kg: int
    in_service: bool = True


@dataclass(frozen=True)
class Driver:
    badge: str
    name: str
    phone: str
    on_duty: bool = True


@dataclass(frozen=True)
class Parcel:
    ref: str
    weight_kg: float
    unit: str = "kg"

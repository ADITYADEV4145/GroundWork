import importlib
import os

from routeplan.depots import DepotBook
from routeplan.models import Depot, Stop

task = os.environ["TASK_ID"]


def load(name):
    return importlib.import_module(name)


if task == "route-stop-key":
    stop_key = load("routeplan.keys").stop_key
    assert stop_key(Stop("Café  Noir, Ltd.", 3, 1.0)) == "cafe_noir_ltd_3"
    assert stop_key(Stop("  Über Straße 9 ", 12, 1.0)) == "uber_strae_9_12"
    assert stop_key(Stop("!!!", 4, 1.0)) == "4"
elif task == "route-depot-name":
    depot_name = load("routeplan.lookup").depot_name
    book = DepotBook([Depot("N1", "north", "North yard"), Depot("S1", "south", "South yard", active=False)])
    assert depot_name(book, " n1 ") == "North yard"
    assert depot_name(book, "S1") is None
    assert depot_name(book, "north") is None
    assert depot_name(book, "zz") is None
elif task == "route-eta-keyword":
    eta_minutes = load("routeplan.timing").eta_minutes
    stop_etas = load("routeplan.schedule").stop_etas
    assert eta_minutes(10) == 15
    assert eta_minutes(10, speed_kph=60) == 10
    try:
        eta_minutes(60, 10)
        raise SystemExit("speed must be keyword-only")
    except TypeError:
        pass
    assert stop_etas([Stop("a", 1, 30.0), Stop("b", 2, 7.0)], 60) == {"a": 30, "b": 10}
elif task == "route-distance-unit":
    format_distance = load("routeplan.distance").format_distance
    assert format_distance(12.34, "km") == "12.3 km"
    assert format_distance(10, "mi") == "6.2 mi"
    labels = {"manifest": "Leg", "driver_sheet": "Drive", "customer_note": "Your parcel travels", "invoice_line": "Billed distance", "audit": "Logged"}
    for name, label in labels.items():
        line = getattr(load(f"routeplan.reports.{name}"), f"{name}_line")
        assert line(Stop("a", 1, 12.34)) == f"{label}: 12.3 km", name
        assert line(Stop("a", 1, 10.0, unit="mi")) == f"{label}: 6.2 mi", name
elif task == "route-pickup-then-dropoff":
    pickup_window = load("routeplan.windows").pickup_window
    assert pickup_window(10, 40) == 25
    assert pickup_window(10, 60) == 20
    assert pickup_window(1, 60) == 15
    dropoff_window = load("routeplan.dropoff").dropoff_window
    assert dropoff_window(10, 40, 2) == 25
    assert dropoff_window(10, 60, 0) == 10
    assert dropoff_window(10, 60, 4) == 25
elif task == "route-path-length":
    from routeplan.models import Point
    path_km = load("routeplan.legs").path_km
    paris, london, berlin = Point(48.8566, 2.3522), Point(51.5074, -0.1278), Point(52.52, 13.405)
    assert path_km([paris, london]) == 343.6
    assert path_km([paris, london, berlin]) == 1275.1
    assert path_km([paris]) == 0
    assert path_km([]) == 0
elif task == "route-shift-length":
    shift_minutes = load("routeplan.shifts").shift_minutes
    assert shift_minutes("9:05", "17:30") == 505
    assert shift_minutes("09.05", "1730") == 505
    assert shift_minutes("9h05", " 9:05 ") == 0
    assert shift_minutes("22:00", "0600") == 480
    for bad in ("24:00", "9:60", "noon"):
        try:
            shift_minutes(bad, "10:00")
            raise SystemExit(f"{bad} is not a time of day")
        except ValueError:
            pass
elif task == "route-vehicle-capacity":
    from routeplan.fleet import Fleet
    from routeplan.models import Vehicle
    vehicle_capacity = load("routeplan.capacity").vehicle_capacity
    fleet = Fleet([Vehicle("AB-123 CD", "van", 800), Vehicle("ZZ-9", "truck", 5000, in_service=False)])
    assert vehicle_capacity(fleet, "ab123cd") == 800
    assert vehicle_capacity(fleet, " AB 123-CD") == 800
    assert vehicle_capacity(fleet, "ZZ-9") is None
    assert vehicle_capacity(fleet, "van") is None
elif task == "route-driver-phone":
    from routeplan.drivers import DriverRoster
    from routeplan.models import Driver
    driver_phone = load("routeplan.contact").driver_phone
    roster = DriverRoster([Driver("D007", "Ana", "555-0101"), Driver("d12", "Ben", "555-0102", on_duty=False)])
    assert driver_phone(roster, "d7") == "555-0101"
    assert driver_phone(roster, " D007 ") == "555-0101"
    assert driver_phone(roster, "D12") is None
    assert driver_phone(roster, "Ana") is None
elif task == "route-fuel-keyword":
    fuel_litres = load("routeplan.fuel").fuel_litres
    costs = load("routeplan.costs")
    assert fuel_litres(120) == 10.2
    assert fuel_litres(120, rate_l_per_100km=10) == 12.0
    try:
        fuel_litres(120, 10)
        raise SystemExit("the rate must be keyword-only")
    except TypeError:
        pass
    stops = [Stop("a", 1, 100.0), Stop("b", 2, 20.0)]
    assert costs.trip_cost(stops, 8.5, 2.0) == 20.4
    assert costs.leg_costs(stops, 10, 1.5) == {"a": 15.0, "b": 3.0}
elif task == "route-load-ratio-keyword":
    from routeplan.models import Parcel, Vehicle
    load_ratio = load("routeplan.capacity_ratio").load_ratio
    loading = load("routeplan.loading")
    assert load_ratio(600, capacity_kg=800) == 0.75
    for wrong in (lambda: load_ratio(800, 600), lambda: load_ratio(600)):
        try:
            wrong()
            raise SystemExit("capacity must be a required keyword")
        except TypeError:
            pass
    van = Vehicle("AB-123", "van", 800)
    assert loading.overloaded(van, [Parcel("p", 400.0), Parcel("q", 401.0)]) is True
    assert loading.overloaded(van, [Parcel("p", 400.0)]) is False
    assert loading.spare_kg(van, [Parcel("p", 600.0)]) == 200.0
elif task == "route-weight-unit":
    from routeplan.models import Parcel
    format_weight = load("routeplan.weight").format_weight
    assert format_weight(12.34, "kg") == "12.3 kg"
    assert format_weight(10, "lb") == "22.0 lb"
    try:
        format_weight(12.34)
        raise SystemExit("the unit must be required")
    except TypeError:
        pass
    labels = {"parcel": "Weight", "pallet": "Gross", "customs": "Declared weight", "pickup": "Collect"}
    for name, label in labels.items():
        line = getattr(load(f"routeplan.labels.{name}"), f"{name}_label")
        assert line(Parcel("p", 12.34)) == f"{label}: 12.3 kg", name
        assert line(Parcel("p", 10.0, unit="lb")) == f"{label}: 22.0 lb", name
elif task == "route-duration-style":
    format_duration = load("routeplan.duration").format_duration
    assert format_duration(95, "clock") == "1:35"
    assert format_duration(5, "clock") == "0:05"
    assert format_duration(95, "words") == "1 h 35 min"
    assert format_duration(120, "words") == "2 h 0 min"
    assert format_duration(45, "words") == "45 min"
    try:
        format_duration(95)
        raise SystemExit("the style must be required")
    except TypeError:
        pass
    notices = {"sms": "ETA 1:35", "board": "Due in 1:35", "email": "Your delivery arrives in 1 h 35 min", "receipt": "Delivered in 1 h 35 min"}
    for name, text in notices.items():
        assert getattr(load(f"routeplan.notices.{name}"), f"{name}_notice")(95) == text, name
elif task == "route-toll-then-parking":
    toll_charge = load("routeplan.tolls").toll_charge
    assert toll_charge(12, 0.31) == 5.25
    assert toll_charge(10, 0.25) == 4.0
    parking_charge = load("routeplan.parking").parking_charge
    assert parking_charge(50, 3) == 2.5
    assert parking_charge(60, 2.4) == 2.4
    assert parking_charge(1, 0.6) == 0.05
elif task == "route-pallet-then-crate":
    pallet_billable = load("routeplan.pallets").pallet_billable
    assert pallet_billable([3.2, 4.1]) == 27.5
    assert pallet_billable([0.5]) == 20.5
    crate_billable = load("routeplan.crates").crate_billable
    assert crate_billable([9.0], 1) == 13.5
    assert crate_billable([0.2], 0) == 1.0
    assert crate_billable([3.3], 2) == 12.5
else:
    raise SystemExit(f"Unknown task {task}")

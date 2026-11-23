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
else:
    raise SystemExit(f"Unknown task {task}")

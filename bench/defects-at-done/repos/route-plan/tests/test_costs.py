import unittest

from routeplan.costs import leg_costs, trip_cost
from routeplan.loading import overloaded, spare_kg
from routeplan.models import Parcel, Stop, Vehicle


class Costs(unittest.TestCase):
    def test_costs(self):
        stops = [Stop("a", 1, 100.0), Stop("b", 2, 20.0)]
        self.assertEqual(trip_cost(stops, 8.5, 2.0), 20.4)
        self.assertEqual(leg_costs(stops, 10, 1.5), {"a": 15.0, "b": 3.0})

    def test_loading(self):
        van = Vehicle("AB-123", "van", 800)
        self.assertFalse(overloaded(van, [Parcel("p", 400.0)]))
        self.assertTrue(overloaded(van, [Parcel("p", 400.0), Parcel("q", 401.0)]))
        self.assertEqual(spare_kg(van, [Parcel("p", 600.0)]), 200.0)

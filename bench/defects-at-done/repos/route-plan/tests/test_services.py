import unittest

from routeplan.depots import DepotBook
from routeplan.internal.textcase import snake_join
from routeplan.models import Depot, Stop
from routeplan.rounding import round_up_to_five
from routeplan.schedule import stop_etas


class Services(unittest.TestCase):
    def test_depots(self):
        book = DepotBook([Depot("N1", "north", "North yard", active=False)])
        self.assertIsNone(book.find_by_code("n1", active_only=True))
        self.assertEqual(book.find_by_code(" n1 ", active_only=False).name, "North yard")
        self.assertEqual(len(book.find_by_zone("north")), 1)

    def test_timing(self):
        self.assertEqual(round_up_to_five(11), 15)
        self.assertEqual(round_up_to_five(15), 15)
        self.assertEqual(stop_etas([Stop("a", 1, 10.0)], 40), {"a": 15})
        self.assertEqual(snake_join("Café  Noir, Ltd."), "cafe_noir_ltd")

import unittest

from routeplan.models import Stop
from routeplan.reports.audit import audit_line
from routeplan.reports.customer_note import customer_note_line
from routeplan.reports.driver_sheet import driver_sheet_line
from routeplan.reports.invoice_line import invoice_line_line
from routeplan.reports.manifest import manifest_line


class Reports(unittest.TestCase):
    def test_lines(self):
        stop = Stop("a", 1, 12.34)
        self.assertEqual(manifest_line(stop), "Leg: 12.3 km")
        self.assertEqual(driver_sheet_line(stop), "Drive: 12.3 km")
        self.assertEqual(customer_note_line(stop), "Your parcel travels: 12.3 km")
        self.assertEqual(invoice_line_line(stop), "Billed distance: 12.3 km")
        self.assertEqual(audit_line(stop), "Logged: 12.3 km")

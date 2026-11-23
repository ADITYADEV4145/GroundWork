import unittest

from routeplan.labels.customs import customs_label
from routeplan.labels.pallet import pallet_label
from routeplan.labels.parcel import parcel_label
from routeplan.labels.pickup import pickup_label
from routeplan.models import Parcel
from routeplan.notices.board import board_notice
from routeplan.notices.email import email_notice
from routeplan.notices.receipt import receipt_notice
from routeplan.notices.sms import sms_notice


class Labels(unittest.TestCase):
    def test_labels(self):
        parcel = Parcel("p", 12.34)
        self.assertEqual(parcel_label(parcel), "Weight: 12.3")
        self.assertEqual(pallet_label(parcel), "Gross: 12.3")
        self.assertEqual(customs_label(parcel), "Declared weight: 12.3")
        self.assertEqual(pickup_label(parcel), "Collect: 12.3")

    def test_notices(self):
        self.assertEqual(sms_notice(95), "ETA 1:35")
        self.assertEqual(board_notice(95), "Due in 1:35")
        self.assertEqual(email_notice(95), "Your delivery arrives in 1 h 35 min")
        self.assertEqual(receipt_notice(95), "Delivered in 1 h 35 min")

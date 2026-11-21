import unittest
from dispatch.warehouse import StockLedger
from dispatch.delivery import quote_delivery

class Services(unittest.TestCase):
    def test_holds_and_regions(self):
        ledger = StockLedger({'book': 3})
        self.assertEqual(ledger.hold('book', 4), 0)
        self.assertEqual(ledger.hold('book', 4, allow_partial=True), 3)
        self.assertEqual(quote_delivery(1.5, region='local'), 350)

from .models import Invoce  # expect: unknown-export
from .nothing import x  # expect: missing-module
from .models import Invoice, charge, fmt, Line, needs_key
from . import tax

inv = Invoice("c")
charge()  # expect: arity
charge(inv, "us", 3)  # expect: arity
charge(inv, regoin="us")  # expect: unknown-keyword
Invoice("c", currency="EUR", tip=1)  # expect: unknown-keyword
Invoice()  # expect: arity
Invoice("c", 1, "EUR")  # expect: arity
tax.rates("eu")  # expect: unknown-member
Invoice.from_json({})  # expect: unknown-member
fmt(value=1)  # expect: unknown-keyword
Line()  # expect: arity
needs_key()  # expect: arity


class Report:
    def build(self):
        return 1

    def run(self):
        self.render()  # expect: unknown-member
        return self.build(1)  # expect: arity

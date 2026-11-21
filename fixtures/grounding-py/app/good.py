import json
from app import tax as tax_mod
from . import tax
from .models import A, B, Dyn, Invoice, Line, cached, charge, fmt, log_all, needs_key


class Failure(Exception):
    def report(self):
        return self.with_traceback(None)


class Job:
    def __init__(self, fn):
        self.callback = fn

    def run(self):
        return self.callback()


def valid(name, args, kwargs):
    inv = Invoice("c", 2, currency="EUR")
    charge(inv)
    charge(inv, region="x")
    charge(invoice=inv)
    charge(*args)
    charge(inv, **kwargs)
    Invoice.parse("x", strict=True)
    Invoice.from_dict({"customer": "c"})
    Invoice.total(inv)
    log_all(1, 2, 3, a=1)
    fmt(1, width=3)
    Line("a")
    Line(sku="a", qty=2)
    needs_key(key=1)
    cached(1, 2)
    getattr(inv, name)()
    Dyn().anything(1, x=2)
    tax.rate("eu")
    tax_mod.rate("us")
    json.dumps({"a": A + B})
    Job(lambda: 1).run()
    return inv.pay()

import functools
from dataclasses import dataclass


class Invoice:
    def __init__(self, customer, amount=0, *, currency="USD"):
        self.customer = customer
        self.amount = amount
        self.currency = currency
        self.on_paid = None

    def total(self):
        return self.amount

    def pay(self):
        if self.on_paid:
            self.on_paid()
        return self.total()

    @classmethod
    def from_dict(cls, data):
        return cls(data["customer"], data.get("amount", 0))

    @staticmethod
    def parse(raw, strict=False):
        return Invoice(raw)


@dataclass
class Line:
    sku: str
    qty: int = 1


class Dyn:
    def __getattr__(self, name):
        return lambda *a, **k: name


def charge(invoice, region="eu"):
    return invoice.total()


def fmt(value, /, width=10):
    return str(value).rjust(width)


def log_all(*items, **opts):
    return items, opts


@functools.lru_cache(maxsize=None)
def cached(key):
    return key


def needs_key(*, key):
    return key


A, B = 1, 2

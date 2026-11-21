from dataclasses import dataclass, field
from typing import List

DEFAULT_CURRENCY = "USD"


@dataclass
class Invoice:
    """An invoice line set."""

    customer_id: str
    amounts: List[float] = field(default_factory=list)
    currency: str = DEFAULT_CURRENCY

    def total(self) -> float:
        return sum(self.amounts)


class Customer:
    def __init__(self, name, email=None):
        self.name = name
        self.email = email

    @property
    def display(self):
        return self.name.title()

    @staticmethod
    def parse(raw, *, strict=False):
        return Customer(raw)

    def _private(self):
        return None

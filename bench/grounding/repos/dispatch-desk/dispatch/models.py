from dataclasses import dataclass

@dataclass
class Order:
    reference: str
    customer_id: str
    cancelled: bool
    sku: str
    quantity: int
    unit_cents: int
    weight: float

@dataclass
class Customer:
    id: str
    email: str
    billing_email: str
